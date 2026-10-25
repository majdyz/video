import AVFoundation
import CoreVideo
import XCTest
@testable import DiveExport

final class HTTPRequestParserTests: XCTestCase {
    func testPipelinedRequestsAcrossChunks() throws {
        var p = HTTPRequestParser()
        let raw = "POST /export/a%20b/frame?token=t&seq=0&name=x+y HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 5\r\n\r\nhelloGET /ping?token=t HTTP/1.1\r\nConnection: close\r\n\r\n"
        let bytes = Data(raw.utf8)
        p.append(bytes.prefix(20))
        XCTAssertNil(try p.next())
        p.append(bytes.dropFirst(20).prefix(60))
        XCTAssertNil(try p.next())
        p.append(bytes.dropFirst(80))
        let r1 = try XCTUnwrap(try p.next())
        XCTAssertEqual(r1.method, "POST")
        XCTAssertEqual(r1.path, "/export/a b/frame")
        XCTAssertEqual(r1.query["token"], "t")
        XCTAssertEqual(r1.query["name"], "x y")
        XCTAssertEqual(r1.body, Data("hello".utf8))
        XCTAssertTrue(r1.keepAlive)
        let r2 = try XCTUnwrap(try p.next())
        XCTAssertEqual(r2.method, "GET")
        XCTAssertEqual(r2.path, "/ping")
        XCTAssertFalse(r2.keepAlive)
        XCTAssertNil(try p.next())
    }

    func testChunkedIsRejected() {
        var p = HTTPRequestParser()
        p.append(Data("POST /file HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n".utf8))
        XCTAssertThrowsError(try p.next()) { XCTAssertEqual($0 as? HTTPParseError, .lengthRequired) }
    }

    func testBodyLimit() {
        var p = HTTPRequestParser(maxBody: 10)
        p.append(Data("POST /file HTTP/1.1\r\nContent-Length: 11\r\n\r\n".utf8))
        XCTAssertThrowsError(try p.next()) { XCTAssertEqual($0 as? HTTPParseError, .tooLarge(11)) }
    }
}

final class PixelCopyTests: XCTestCase {
    private func makeBuffer(_ w: Int, _ h: Int) -> CVPixelBuffer {
        var pb: CVPixelBuffer?
        CVPixelBufferCreate(nil, w, h, kCVPixelFormatType_32BGRA, nil, &pb)
        return pb!
    }

    private func pixel(_ pb: CVPixelBuffer, _ x: Int, _ y: Int) -> [UInt8] {
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        let p = CVPixelBufferGetBaseAddress(pb)!.advanced(by: y * CVPixelBufferGetBytesPerRow(pb) + x * 4).assumingMemoryBound(to: UInt8.self)
        return [p[0], p[1], p[2], p[3]]
    }

    func testRGBAIsSwizzledToBGRA() throws {
        let w = 3, h = 2
        var src = [UInt8](repeating: 0, count: w * h * 4)
        // pixel (2,1) = R 10, G 20, B 30, A 255
        let i = (1 * w + 2) * 4
        src[i] = 10; src[i + 1] = 20; src[i + 2] = 30; src[i + 3] = 255
        let pb = makeBuffer(w, h)
        try src.withUnsafeBytes { try PixelCopy.copy($0, width: w, height: h, format: .rgba, into: pb) }
        XCTAssertEqual(pixel(pb, 2, 1), [30, 20, 10, 255])
    }

    func testBGRXCopiesRowsAndCropsToBuffer() throws {
        let w = 5, h = 3
        var src = [UInt8](repeating: 0, count: w * h * 4)
        let i = (1 * w + 3) * 4
        src[i] = 1; src[i + 1] = 2; src[i + 2] = 3
        let pb = makeBuffer(4, 2) // even-size rounding drops the last column/row
        try src.withUnsafeBytes { try PixelCopy.copy($0, width: w, height: h, format: .bgrx, into: pb) }
        XCTAssertEqual(Array(pixel(pb, 3, 1).prefix(3)), [1, 2, 3])
    }

    func testShortBufferThrows() {
        let pb = makeBuffer(2, 2)
        let src = [UInt8](repeating: 0, count: 8)
        XCTAssertThrowsError(try src.withUnsafeBytes { try PixelCopy.copy($0, width: 2, height: 2, format: .rgba, into: pb) })
    }
}

final class FrameEncoderTests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("dive-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dir)
    }

    /// 1.5 s AAC sine, standing in for a clip's audio track.
    private func makeAudioSource() throws -> URL {
        let url = dir.appendingPathComponent("source.m4a")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
        let frames = AVAudioFrameCount(44_100 * 3 / 2)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        let ch = buffer.floatChannelData![0]
        for i in 0..<Int(frames) { ch[i] = 0.2 * sinf(Float(i) * 2 * .pi * 440 / 44_100) }
        do {
            let file = try AVAudioFile(forWriting: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
            ])
            try file.write(from: buffer)
        }
        return url
    }

    private func frame(_ w: Int, _ h: Int, _ n: Int) -> [UInt8] {
        var px = [UInt8](repeating: 0, count: w * h * 4)
        for y in 0..<h {
            for x in 0..<w {
                let i = (y * w + x) * 4
                px[i] = UInt8((x + n * 4) & 255); px[i + 1] = UInt8(y & 255); px[i + 2] = 128; px[i + 3] = 255
            }
        }
        return px
    }

    func testEncodesFramesWithAudioPassthrough() async throws {
        let audio = try makeAudioSource()
        let out = dir.appendingPathComponent("out.mp4")
        let w = 321, h = 240 // odd width: rounded down to even
        let enc = try await FrameEncoder.make(EncoderConfig(output: out, width: w, height: h, fps: 30, bitrate: 2_000_000, durationSec: 1, audioSource: audio))
        XCTAssertTrue(enc.hasAudio)
        XCTAssertEqual(enc.width, 320)
        for n in 0..<30 {
            let px = frame(w, h, n)
            try px.withUnsafeBytes { try enc.append($0, width: w, height: h, format: .rgba, ptsUs: Int64(n) * 33_333) }
        }
        XCTAssertThrowsError(try [UInt8](repeating: 0, count: w * h * 4).withUnsafeBytes { try enc.append($0, width: w, height: h, format: .rgba, ptsUs: 0) })
        let result: EncoderResult = try await withCheckedThrowingContinuation { cont in enc.finish { cont.resume(with: $0) } }
        XCTAssertEqual(result.frames, 30)
        XCTAssertTrue(result.audioIncluded)
        XCTAssertGreaterThan(result.bytes, 1000)

        let asset = AVURLAsset(url: out)
        let v = try await asset.loadTracks(withMediaType: .video)
        let a = try await asset.loadTracks(withMediaType: .audio)
        XCTAssertEqual(v.count, 1)
        XCTAssertEqual(a.count, 1)
        let size = try await v[0].load(.naturalSize)
        XCTAssertEqual(size, CGSize(width: 320, height: 240))
        let dur = try await asset.load(.duration).seconds
        // The session ends one frame after the last one; the audio overhang is cut.
        XCTAssertEqual(dur, 1.0, accuracy: 0.1)
    }

    func testCancelRemovesFile() async throws {
        let out = dir.appendingPathComponent("cancel.mp4")
        let enc = try await FrameEncoder.make(EncoderConfig(output: out, width: 64, height: 64, fps: 30, bitrate: 500_000, durationSec: 1))
        let px = frame(64, 64, 0)
        try px.withUnsafeBytes { try enc.append($0, width: 64, height: 64, format: .bgra, ptsUs: 0) }
        enc.cancel()
        XCTAssertFalse(FileManager.default.fileExists(atPath: out.path))
        XCTAssertThrowsError(try px.withUnsafeBytes { try enc.append($0, width: 64, height: 64, format: .bgra, ptsUs: 40_000) })
    }
}

final class ExportHubTests: XCTestCase {
    func testFramesOverLoopback() async throws {
        let logLock = NSLock()
        var logs: [String] = []
        LoopbackServer.debugLog = { line in logLock.lock(); logs.append(line); logLock.unlock() }
        defer { LoopbackServer.debugLog = nil }
        func dump() -> String { logLock.lock(); defer { logLock.unlock() }; return logs.joined(separator: "\n") }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("dive-hub-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let hub = ExportHub(exportsDir: root.appendingPathComponent("exports"), filesDir: root.appendingPathComponent("files"))
        let port = try await hub.start()
        XCTAssertGreaterThan(port, 0)
        let base = "http://127.0.0.1:\(port)"
        let token = hub.server.token

        // Wrong token.
        var bad = URLRequest(url: URL(string: "\(base)/ping?token=nope")!)
        bad.httpMethod = "GET"
        do {
            let (_, badRes) = try await URLSession.shared.data(for: bad)
            XCTAssertEqual((badRes as? HTTPURLResponse)?.statusCode, 403)
        } catch {
            XCTFail("first request failed: \(error)\nserver log:\n\(dump())")
            throw error
        }

        let out = hub.outputURL(for: "clip-fixed.mp4")
        try await hub.begin(id: "t1", config: EncoderConfig(output: out, width: 96, height: 64, fps: 25, bitrate: 500_000, durationSec: 0.4))
        for seq in 0..<10 {
            var req = URLRequest(url: URL(string: "\(base)/export/t1/frame?token=\(token)&seq=\(seq)&pts=\(seq * 40_000)&dur=40000&fmt=BGRX&w=96&h=64")!)
            req.httpMethod = "POST"
            req.setValue("text/plain", forHTTPHeaderField: "content-type")
            let (body, res) = try await URLSession.shared.upload(for: req, from: Data(repeating: UInt8(seq * 20), count: 96 * 64 * 4))
            XCTAssertEqual((res as? HTTPURLResponse)?.statusCode, 200, String(data: body, encoding: .utf8) ?? "")
        }
        // Out-of-order frame is refused.
        var late = URLRequest(url: URL(string: "\(base)/export/t1/frame?token=\(token)&seq=3&pts=1&fmt=BGRX&w=96&h=64")!)
        late.httpMethod = "POST"
        let (_, lateRes) = try await URLSession.shared.upload(for: late, from: Data(count: 96 * 64 * 4))
        XCTAssertEqual((lateRes as? HTTPURLResponse)?.statusCode, 409)

        let result = try await hub.finish(id: "t1")
        XCTAssertEqual(result.frames, 10)
        XCTAssertTrue(result.audioIncluded) // no audio was asked for, none dropped
        XCTAssertTrue(FileManager.default.fileExists(atPath: result.url.path))

        // File upload route.
        var up = URLRequest(url: URL(string: "\(base)/file?token=\(token)&name=photo%2F..%2Fx.jpg&mime=image/jpeg")!)
        up.httpMethod = "POST"
        let (json, upRes) = try await URLSession.shared.upload(for: up, from: Data([1, 2, 3]))
        XCTAssertEqual((upRes as? HTTPURLResponse)?.statusCode, 200)
        let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: json) as? [String: Any])
        XCTAssertEqual(obj["size"] as? Int, 3)
        let path = try XCTUnwrap(obj["path"] as? String)
        XCTAssertTrue(path.hasPrefix(hub.filesDir.path))
        XCTAssertFalse((obj["name"] as? String ?? "").contains("/"))
        hub.server.stop()
    }
}
