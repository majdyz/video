import AVFoundation
import CoreMedia
import CoreVideo
import Foundation

public struct EncoderConfig {
    public enum Codec: String { case avc, hevc }

    public var output: URL
    public var width: Int
    public var height: Int
    public var fps: Double
    public var bitrate: Int
    public var codec: Codec
    public var keyFrameIntervalSec: Double
    public var durationSec: Double
    /// Source file whose audio track is copied through (no re-encode when the
    /// codec fits MP4; LPCM is encoded to AAC).
    public var audioSource: URL?
    /// Source time of the first video frame. Frame timestamps are relative to
    /// it; the writer session starts there so the audio stays in sync and
    /// any audio priming before it is trimmed by the edit list.
    public var audioShiftSec: Double

    public init(output: URL, width: Int, height: Int, fps: Double, bitrate: Int, codec: Codec = .avc, keyFrameIntervalSec: Double = 2, durationSec: Double, audioSource: URL? = nil, audioShiftSec: Double = 0) {
        self.output = output
        self.width = width
        self.height = height
        self.fps = fps
        self.bitrate = bitrate
        self.codec = codec
        self.keyFrameIntervalSec = keyFrameIntervalSec
        self.durationSec = durationSec
        self.audioSource = audioSource
        self.audioShiftSec = audioShiftSec
    }
}

public struct EncoderResult {
    public var url: URL
    public var frames: Int
    public var bytes: Int
    public var audioIncluded: Bool
    public var durationSec: Double
}

public enum EncoderError: Error, CustomStringConvertible {
    case setup(String)
    case writer(String)
    case timeout
    case cancelled
    case outOfOrder(last: Int64, got: Int64)

    public var description: String {
        switch self {
        case .setup(let s): return "encoder setup: \(s)"
        case .writer(let s): return "encoder: \(s)"
        case .timeout: return "encoder stalled"
        case .cancelled: return "export cancelled"
        case .outOfOrder(let l, let g): return "frame timestamps out of order (\(l) then \(g) µs)"
        }
    }
}

/// H.264 / HEVC encoder for frames rendered by the web side: AVAssetWriter
/// with a pixel buffer adaptor (32BGRA in, hardware encoder), plus the
/// source's audio track copied through an AVAssetReader. Not thread-safe:
/// call `append` / `finish` / `cancel` from one serial queue.
public final class FrameEncoder {
    public let config: EncoderConfig
    public let width: Int
    public let height: Int
    public private(set) var frames = 0
    public private(set) var lastPtsUs: Int64 = -1
    public var hasAudio: Bool { audioInput != nil }

    private let writer: AVAssetWriter
    private let videoInput: AVAssetWriterInput
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor
    private var audioInput: AVAssetWriterInput?
    private var audioReader: AVAssetReader?
    private var audioOutput: AVAssetReaderTrackOutput?
    private let audioQueue = DispatchQueue(label: "dive.encoder.audio")
    private let audioDone = DispatchGroup()
    private var audioFinished = false
    private var audioFailed = false
    private var cancelled = false
    private let shift: CMTime

    /// Creates the writer and starts the session (async: the audio track is loaded first).
    public static func make(_ config: EncoderConfig) async throws -> FrameEncoder {
        var audio: (AVAsset, AVAssetTrack, CMFormatDescription?)?
        if let src = config.audioSource {
            let asset = AVURLAsset(url: src)
            if let track = try? await asset.loadTracks(withMediaType: .audio).first {
                let fds = (try? await track.load(.formatDescriptions)) ?? []
                audio = (asset, track, fds.first)
            }
        }
        return try FrameEncoder(config: config, audio: audio)
    }

    private init(config: EncoderConfig, audio: (AVAsset, AVAssetTrack, CMFormatDescription?)?) throws {
        self.config = config
        // 4:2:0 needs even sizes; the odd row/column is dropped.
        width = max(2, config.width & ~1)
        height = max(2, config.height & ~1)
        shift = CMTime(seconds: max(0, config.audioShiftSec), preferredTimescale: 1_000_000)
        try? FileManager.default.removeItem(at: config.output)
        do {
            writer = try AVAssetWriter(outputURL: config.output, fileType: .mp4)
        } catch {
            throw EncoderError.setup("AVAssetWriter: \(error.localizedDescription)")
        }
        writer.shouldOptimizeForNetworkUse = true

        let fps = config.fps > 0 ? config.fps : 30
        var compression: [String: Any] = [
            AVVideoAverageBitRateKey: config.bitrate,
            AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
            AVVideoMaxKeyFrameIntervalKey: max(1, Int((fps * config.keyFrameIntervalSec).rounded())),
            AVVideoMaxKeyFrameIntervalDurationKey: config.keyFrameIntervalSec,
            AVVideoAllowFrameReorderingKey: true,
        ]
        if config.codec == .avc { compression[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel }
        let settings: [String: Any] = [
            AVVideoCodecKey: config.codec == .hevc ? AVVideoCodecType.hevc : AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: compression,
            // The web renderer outputs sRGB-ish BT.709 frames.
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ]
        guard writer.canApply(outputSettings: settings, forMediaType: .video) else {
            throw EncoderError.setup("\(config.codec.rawValue) \(width)x\(height) not supported by this device's encoder")
        }
        videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        videoInput.expectsMediaDataInRealTime = false
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
        ])
        guard writer.canAdd(videoInput) else { throw EncoderError.setup("cannot add video input") }
        writer.add(videoInput)

        if let audio {
            setUpAudio(asset: audio.0, track: audio.1, format: audio.2)
        }

        guard writer.startWriting() else {
            throw EncoderError.setup(writer.error?.localizedDescription ?? "startWriting failed")
        }
        writer.startSession(atSourceTime: shift)
        startAudio()
    }

    private func setUpAudio(asset: AVAsset, track: AVAssetTrack, format: CMFormatDescription?) {
        do {
            let reader = try AVAssetReader(asset: asset)
            let end = CMTime(seconds: max(0, config.audioShiftSec) + config.durationSec + 1, preferredTimescale: 600)
            reader.timeRange = CMTimeRange(start: .zero, end: end)
            let subtype = format.map { CMFormatDescriptionGetMediaSubType($0) }
            let isPCM = subtype == kAudioFormatLinearPCM
            let output = AVAssetReaderTrackOutput(track: track, outputSettings: isPCM ? [AVFormatIDKey: kAudioFormatLinearPCM] : nil)
            output.alwaysCopiesSampleData = false
            guard reader.canAdd(output) else { return }
            reader.add(output)
            let input: AVAssetWriterInput
            if isPCM {
                // MP4 can't carry LPCM: encode it to AAC.
                let asbd = format.flatMap { CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee }
                input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVNumberOfChannelsKey: min(2, Int(asbd?.mChannelsPerFrame ?? 2)),
                    AVSampleRateKey: asbd?.mSampleRate ?? 48_000,
                    AVEncoderBitRateKey: 192_000,
                ])
            } else {
                input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: format)
            }
            input.expectsMediaDataInRealTime = false
            guard writer.canAdd(input) else { return }
            writer.add(input)
            audioReader = reader
            audioOutput = output
            audioInput = input
        } catch {
            audioReader = nil
        }
    }

    private func startAudio() {
        guard let input = audioInput, let reader = audioReader, let output = audioOutput else { return }
        guard reader.startReading() else {
            audioFailed = true
            input.markAsFinished()
            return
        }
        audioDone.enter()
        // The writer interleaves: the audio input reports not-ready while it
        // is ahead of the video, and this block runs again as frames arrive.
        input.requestMediaDataWhenReady(on: audioQueue) { [weak self] in
            guard let self else { return }
            while input.isReadyForMoreMediaData {
                if self.cancelled {
                    self.finishAudio(input, failed: true)
                    return
                }
                guard let sample = output.copyNextSampleBuffer() else {
                    self.finishAudio(input, failed: reader.status == .failed)
                    return
                }
                if !input.append(sample) {
                    self.finishAudio(input, failed: true)
                    return
                }
            }
        }
    }

    private func finishAudio(_ input: AVAssetWriterInput, failed: Bool) {
        guard !audioFinished else { return }
        audioFinished = true
        audioFailed = failed
        input.markAsFinished()
        audioDone.leave()
    }

    /// Encodes one frame. `ptsUs` is relative to the first frame. Blocks
    /// (briefly) while the encoder is busy: that is the backpressure.
    public func append(_ bytes: UnsafeRawBufferPointer, width w: Int, height h: Int, format: PixelFormat, ptsUs: Int64) throws {
        if cancelled { throw EncoderError.cancelled }
        guard ptsUs > lastPtsUs else { throw EncoderError.outOfOrder(last: lastPtsUs, got: ptsUs) }
        let deadline = Date().addingTimeInterval(20)
        while !videoInput.isReadyForMoreMediaData {
            if writer.status == .failed { throw EncoderError.writer(writer.error?.localizedDescription ?? "failed") }
            if cancelled { throw EncoderError.cancelled }
            if Date() > deadline { throw EncoderError.timeout }
            usleep(1000)
        }
        guard let pool = adaptor.pixelBufferPool else { throw EncoderError.writer("no pixel buffer pool (\(writer.status.rawValue))") }
        var pbOut: CVPixelBuffer?
        let r = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pbOut)
        guard r == kCVReturnSuccess, let pb = pbOut else { throw EncoderError.writer("pixel buffer \(r)") }
        CVBufferSetAttachment(pb, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
        CVBufferSetAttachment(pb, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
        try PixelCopy.copy(bytes, width: w, height: h, format: format, into: pb)
        let t = CMTimeAdd(CMTime(value: ptsUs, timescale: 1_000_000), shift)
        guard adaptor.append(pb, withPresentationTime: t) else {
            throw EncoderError.writer(writer.error?.localizedDescription ?? "append failed")
        }
        lastPtsUs = ptsUs
        frames += 1
    }

    /// Closes the video track, waits for the audio copy, writes the moov box.
    public func finish(completion: @escaping (Result<EncoderResult, Error>) -> Void) {
        guard !cancelled else { completion(.failure(EncoderError.cancelled)); return }
        guard frames > 0 else { cancel(); completion(.failure(EncoderError.writer("no frames"))); return }
        videoInput.markAsFinished()
        let frameDur = 1.0 / (config.fps > 0 ? config.fps : 30)
        let end = CMTimeAdd(CMTimeAdd(CMTime(value: lastPtsUs, timescale: 1_000_000), CMTime(seconds: frameDur, preferredTimescale: 1_000_000)), shift)
        let finishWriting = { [self] in
            writer.endSession(atSourceTime: end)
            writer.finishWriting { [self] in
                if writer.status == .completed {
                    let bytes = (try? FileManager.default.attributesOfItem(atPath: config.output.path)[.size] as? NSNumber)?.intValue ?? 0
                    completion(.success(EncoderResult(url: config.output, frames: frames, bytes: bytes, audioIncluded: config.audioSource == nil || (audioInput != nil && !audioFailed), durationSec: CMTimeGetSeconds(CMTimeSubtract(end, shift)))))
                } else {
                    completion(.failure(EncoderError.writer(writer.error?.localizedDescription ?? "finishWriting status \(writer.status.rawValue)")))
                }
            }
        }
        if audioInput != nil {
            // With the video finished the writer no longer holds the audio back.
            DispatchQueue.global(qos: .userInitiated).async { [self] in
                if audioDone.wait(timeout: .now() + 30) == .timedOut {
                    audioReader?.cancelReading()
                    audioFailed = true
                }
                finishWriting()
            }
        } else {
            finishWriting()
        }
    }

    public func cancel() {
        guard !cancelled else { return }
        cancelled = true
        audioReader?.cancelReading()
        if writer.status == .writing { writer.cancelWriting() }
        try? FileManager.default.removeItem(at: config.output)
    }
}
