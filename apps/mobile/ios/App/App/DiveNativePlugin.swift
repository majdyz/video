import AVFoundation
import Capacitor
import DiveExport
import UIKit

/// `DiveNative` Capacitor plugin (contract: apps/studio/src/native/plugin.ts).
/// Control calls arrive over the bridge; frames and file uploads go to the
/// loopback endpoint owned by `ExportHub` (DiveExport package).
@objc(DiveNativePlugin)
public class DiveNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DiveNativePlugin"
    public let jsName = "DiveNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickMedia", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startExport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendFrame", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishExport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelExport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setExportStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToGallery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeFile", returnType: CAPPluginReturnPromise),
    ]

    private let caches: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    private var importsDir: URL { caches.appendingPathComponent("imports") }
    /// Created in load() (before any call can arrive), then only read.
    private var hub: ExportHub!
    /// Main-thread only.
    private var background: [String: BackgroundExport] = [:]
    private var startTimes: [String: Date] = [:]
    private var importer: MediaImport?

    override public func load() {
        let hub = ExportHub(exportsDir: caches.appendingPathComponent("exports"), filesDir: caches.appendingPathComponent("shared"))
        hub.onProgress = { [weak self] id, frames, fraction in
            DispatchQueue.main.async {
                self?.background[id]?.update(fraction: fraction)
                self?.notifyListeners("exportProgress", data: ["id": id, "frames": frames, "progress": fraction])
            }
        }
        self.hub = hub
        // Old imports / exports from earlier launches (the WebView holds no references to them).
        for dir in [importsDir, caches.appendingPathComponent("shared")] {
            try? FileManager.default.removeItem(at: dir)
        }
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        nc.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    @objc private func didEnterBackground() {
        for id in background.keys { notifyListeners("exportState", data: ["id": id, "state": "paused"]) }
    }

    @objc private func willEnterForeground() {
        for id in background.keys { notifyListeners("exportState", data: ["id": id, "state": "resumed"]) }
    }

    private func ensureServer() async throws -> UInt16 {
        try await hub.start()
    }

    // MARK: - info

    @objc func getInfo(_ call: CAPPluginCall) {
        Task {
            do {
                _ = try await ensureServer()
                let hevc = AVAssetExportSession.allExportPresets().contains(AVAssetExportPresetHEVCHighestQuality)
                call.resolve([
                    "platform": "ios",
                    "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
                    "encoders": ["avc": true, "hevc": hevc],
                    "background": BackgroundExport.mode,
                    "frameFormats": PixelFormat.allCases.map(\.rawValue),
                    "endpoint": hub.server.endpoint,
                    "token": hub.server.token,
                ])
            } catch {
                call.reject("Loopback endpoint failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - picking

    @objc func pickMedia(_ call: CAPPluginCall) {
        let source = call.getString("source") ?? "photos"
        let kinds = call.getArray("kinds", String.self) ?? []
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { return call.reject("No view controller") }
            let importer = MediaImport(importsDir: self.importsDir)
            self.importer = importer
            importer.present(from: vc, source: source, kinds: kinds) { result in
                self.importer = nil
                switch result {
                case .success(let files):
                    call.resolve(["files": files.map { ["path": $0.url.path, "name": $0.name, "mime": $0.mime, "size": $0.size] }])
                case .failure(let error):
                    call.reject("Import failed: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - export

    @objc func startExport(_ call: CAPPluginCall) {
        guard let width = call.getInt("width"), let height = call.getInt("height"), width > 1, height > 1 else {
            return call.reject("width/height required")
        }
        let id = String(UUID().uuidString.prefix(8)).lowercased()
        let audio = call.getObject("audio")
        let audioPath = audio?["path"] as? String
        let config = EncoderConfig(
            output: hub.outputURL(for: call.getString("outputName") ?? "export.mp4"),
            width: width,
            height: height,
            fps: call.getDouble("fps") ?? 30,
            bitrate: call.getInt("bitrate") ?? 20_000_000,
            codec: EncoderConfig.Codec(rawValue: call.getString("codec") ?? "avc") ?? .avc,
            keyFrameIntervalSec: call.getDouble("keyFrameIntervalSec") ?? 2,
            durationSec: call.getDouble("durationSec") ?? 0,
            audioSource: audioPath.map { URL(fileURLWithPath: $0) },
            audioShiftSec: (audio?["shiftSec"] as? Double) ?? (audio?["shiftSec"] as? NSNumber)?.doubleValue ?? 0
        )
        let title = call.getString("title") ?? "Exporting video"
        let subtitle = call.getString("subtitle") ?? ""
        // Submitted now, while the user's Export tap is being handled (a
        // requirement of BGContinuedProcessingTaskRequest).
        let bg = BackgroundExport(exportId: id, title: title, subtitle: subtitle) { [weak self] state, message in
            var data: [String: Any] = ["id": id, "state": state.rawValue]
            if let message { data["message"] = message }
            self?.notifyListeners("exportState", data: data)
            if state == .expired { self?.hub.cancel(id: id) }
        }
        Task {
            do {
                let port = try await ensureServer()
                try await hub.begin(id: id, config: config)
                await MainActor.run {
                    self.background[id] = bg
                    self.startTimes[id] = Date()
                    bg.start()
                }
                call.resolve(["id": id, "endpoint": "http://127.0.0.1:\(port)", "token": hub.server.token, "maxInFlight": 1])
            } catch {
                call.reject("Could not start the encoder: \(error)")
            }
        }
    }

    /// Bridge fallback for frames (base64 in JSON: slow, only used when the
    /// page can't reach the loopback endpoint).
    @objc func appendFrame(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let seq = call.getInt("seq"),
              let w = call.getInt("w"), let h = call.getInt("h"),
              let fmt = call.getString("fmt").flatMap(PixelFormat.init(rawValue:)),
              let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else {
            return call.reject("id/seq/w/h/fmt/data required")
        }
        let pts = Int64((call.getDouble("pts") ?? 0).rounded())
        hub.appendFrame(id: id, seq: seq, ptsUs: pts, width: w, height: h, format: fmt, pixels: data) { error in
            if let error { call.reject("\(error)") } else { call.resolve() }
        }
    }

    @objc func finishExport(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("id required") }
        Task {
            do {
                let r = try await hub.finish(id: id)
                let (bg, startedAt) = await MainActor.run { (self.background.removeValue(forKey: id), self.startTimes.removeValue(forKey: id)) }
                bg?.complete(success: true)
                let elapsed = startedAt.map { Date().timeIntervalSince($0) * 1000 } ?? 0
                call.resolve([
                    "path": r.url.path,
                    "name": r.url.lastPathComponent,
                    "mime": "video/mp4",
                    "size": r.bytes,
                    "frames": r.frames,
                    "durationSec": r.durationSec,
                    "audioIncluded": r.audioIncluded,
                    "elapsedMs": elapsed,
                ])
            } catch {
                let bg = await MainActor.run { self.background.removeValue(forKey: id) }
                bg?.complete(success: false)
                call.reject("Export failed: \(error)")
            }
        }
    }

    @objc func cancelExport(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("id required") }
        hub.cancel(id: id)
        DispatchQueue.main.async {
            self.background.removeValue(forKey: id)?.complete(success: false)
            self.startTimes[id] = nil
            call.resolve()
        }
    }

    @objc func setExportStatus(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("id required") }
        DispatchQueue.main.async {
            if let bg = self.background[id] {
                bg.update(fraction: call.getDouble("progress") ?? 0, subtitle: call.getString("subtitle"))
            }
            call.resolve()
        }
    }

    // MARK: - files

    @objc func saveToGallery(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { return call.reject("path required") }
        let url = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: url.path) else { return call.reject("No such file") }
        GallerySaver.save(url, isVideo: call.getString("kind") != "photo") { result in
            switch result {
            case .success(let saved): call.resolve(["saved": saved])
            case .failure(let error): call.reject("Saving to Photos failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func writeFile(_ call: CAPPluginCall) {
        guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else { return call.reject("data required") }
        let name = call.getString("name") ?? "file.bin"
        let mime = call.getString("mime") ?? "application/octet-stream"
        do {
            let url = try hub.writeShared(data, name: name)
            call.resolve(["path": url.path, "name": url.lastPathComponent, "mime": mime, "size": data.count])
        } catch {
            call.reject("Write failed: \(error.localizedDescription)")
        }
    }

    @objc func removeFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { return call.reject("path required") }
        // Only files under our caches folder (imports, exports, shared uploads).
        let url = URL(fileURLWithPath: path).standardizedFileURL
        guard url.path.hasPrefix(caches.standardizedFileURL.path) else { return call.reject("Not an app file") }
        try? FileManager.default.removeItem(at: url)
        call.resolve()
    }
}
