import Foundation

/// Owns the loopback endpoint and the running export sessions. The Capacitor
/// plugin (ios/App/App/DiveNativePlugin.swift) is a thin bridge over this.
///
/// Routes (all need `?token=`):
///   POST /export/<id>/frame?seq=&pts=&dur=&fmt=&w=&h=   raw pixels -> encoder
///   POST /file?name=&mime=                              body -> filesDir, JSON NativeFile back
public final class ExportHub {
    public let server: LoopbackServer
    public let exportsDir: URL
    public let filesDir: URL
    /// (id, frames, fraction 0...1), at most ~4 times a second per session.
    public var onProgress: ((String, Int, Double) -> Void)?

    private let lock = NSLock()
    private var sessions: [String: Session] = [:]

    final class Session {
        let id: String
        let encoder: FrameEncoder
        let queue: DispatchQueue
        var nextSeq = 0
        var lastReport = Date.distantPast
        init(id: String, encoder: FrameEncoder) {
            self.id = id
            self.encoder = encoder
            queue = DispatchQueue(label: "dive.export.\(id)", qos: .userInitiated)
        }
    }

    public init(exportsDir: URL, filesDir: URL, token: String = LoopbackServer.makeToken()) {
        self.exportsDir = exportsDir
        self.filesDir = filesDir
        var handler: LoopbackServer.Handler = { _, respond in respond(.text(503, "starting")) }
        server = LoopbackServer(token: token) { req, respond in handler(req, respond) }
        handler = { [weak self] req, respond in
            guard let self else { return respond(.text(503, "gone")) }
            self.handle(req, respond: respond)
        }
        try? FileManager.default.createDirectory(at: exportsDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: filesDir, withIntermediateDirectories: true)
    }

    public func start() async throws -> UInt16 {
        try await withCheckedThrowingContinuation { cont in
            server.start { cont.resume(with: $0) }
        }
    }

    public var activeCount: Int {
        lock.lock(); defer { lock.unlock() }
        return sessions.count
    }

    private func session(_ id: String) -> Session? {
        lock.lock(); defer { lock.unlock() }
        return sessions[id]
    }

    /// A unique output URL in exportsDir for `name` (sanitised).
    public func outputURL(for name: String) -> URL {
        let safe = ExportHub.sanitize(name, fallback: "export.mp4")
        var url = exportsDir.appendingPathComponent(safe)
        var n = 1
        let stem = url.deletingPathExtension().lastPathComponent, ext = url.pathExtension
        while FileManager.default.fileExists(atPath: url.path) {
            n += 1
            url = exportsDir.appendingPathComponent("\(stem)-\(n)").appendingPathExtension(ext)
        }
        return url
    }

    static func sanitize(_ name: String, fallback: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_. "))
        let cleaned = String(name.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" })
            .trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        return cleaned.isEmpty ? fallback : String(cleaned.prefix(120))
    }

    public func begin(id: String, config: EncoderConfig) async throws {
        let encoder = try await FrameEncoder.make(config)
        store(Session(id: id, encoder: encoder))
    }

    // Synchronous helper: NSLock.lock() is unavailable directly in async functions.
    private func store(_ s: Session) {
        lock.lock(); defer { lock.unlock() }
        sessions[s.id] = s
    }

    public func finish(id: String) async throws -> EncoderResult {
        guard let s = session(id) else { throw EncoderError.setup("no export \(id)") }
        defer { remove(id) }
        return try await withCheckedThrowingContinuation { cont in
            s.queue.async { s.encoder.finish { cont.resume(with: $0) } }
        }
    }

    public func cancel(id: String) {
        guard let s = session(id) else { return }
        remove(id)
        s.queue.async { s.encoder.cancel() }
    }

    public func cancelAll() {
        lock.lock()
        let all = Array(sessions.keys)
        lock.unlock()
        for id in all { cancel(id: id) }
    }

    private func remove(_ id: String) {
        lock.lock(); sessions[id] = nil; lock.unlock()
    }

    // MARK: - HTTP

    func handle(_ req: HTTPRequest, respond: @escaping (HTTPResponse) -> Void) {
        let parts = req.path.split(separator: "/").map(String.init)
        if req.method == "POST", parts.count == 3, parts[0] == "export", parts[2] == "frame" {
            return handleFrame(id: parts[1], req, respond: respond)
        }
        if req.method == "POST", parts == ["file"] {
            return handleFile(req, respond: respond)
        }
        if req.method == "GET", parts == ["ping"] {
            return respond(.text(200, "ok"))
        }
        respond(.text(404, "no route \(req.method) \(req.path)"))
    }

    private func handleFrame(id: String, _ req: HTTPRequest, respond: @escaping (HTTPResponse) -> Void) {
        let q = req.query
        guard let seq = q["seq"].flatMap(Int.init), let pts = q["pts"].flatMap(Int64.init),
              let w = q["w"].flatMap(Int.init), let h = q["h"].flatMap(Int.init),
              let fmt = q["fmt"].flatMap(PixelFormat.init(rawValue:)) else {
            return respond(.text(400, "missing seq/pts/w/h/fmt"))
        }
        appendFrame(id: id, seq: seq, ptsUs: pts, width: w, height: h, format: fmt, pixels: req.body) { error in
            switch error {
            case nil: respond(.text(200, "ok"))
            case .some(let e as FrameRouteError): respond(.text(e.status, e.message))
            case .some(let e): respond(.text(500, "\(e)"))
            }
        }
    }

    public struct FrameRouteError: Error, CustomStringConvertible {
        public let status: Int
        public let message: String
        public var description: String { message }
    }

    /// Queues one frame for the encoder (shared by the loopback route and the
    /// bridge fallback). `completion(nil)` once the encoder took it.
    public func appendFrame(id: String, seq: Int, ptsUs: Int64, width w: Int, height h: Int, format fmt: PixelFormat, pixels: Data, completion: @escaping (Error?) -> Void) {
        guard let s = session(id) else { return completion(FrameRouteError(status: 404, message: "no export \(id)")) }
        guard pixels.count == w * h * 4 else {
            return completion(FrameRouteError(status: 400, message: "body is \(pixels.count) bytes, \(w)x\(h) \(fmt.rawValue) needs \(w * h * 4)"))
        }
        s.queue.async { [weak self] in
            guard seq == s.nextSeq else { return completion(FrameRouteError(status: 409, message: "expected frame \(s.nextSeq), got \(seq)")) }
            do {
                try pixels.withUnsafeBytes { raw in
                    try s.encoder.append(raw, width: w, height: h, format: fmt, ptsUs: ptsUs)
                }
                s.nextSeq += 1
                completion(nil)
                let now = Date()
                if now.timeIntervalSince(s.lastReport) > 0.25, let self {
                    s.lastReport = now
                    let dur = s.encoder.config.durationSec
                    let fraction = dur > 0 ? min(1, Double(ptsUs) / 1e6 / dur) : 0
                    self.onProgress?(s.id, s.encoder.frames, fraction)
                }
            } catch {
                completion(error)
            }
        }
    }

    /// Writes `data` as `<filesDir>/<uuid>/<sanitised name>`.
    public func writeShared(_ data: Data, name: String) throws -> URL {
        let safe = ExportHub.sanitize(name, fallback: "file.bin")
        let url = filesDir.appendingPathComponent(UUID().uuidString, isDirectory: true).appendingPathComponent(safe)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
        return url
    }

    private func handleFile(_ req: HTTPRequest, respond: @escaping (HTTPResponse) -> Void) {
        let mime = req.query["mime"] ?? "application/octet-stream"
        do {
            let url = try writeShared(req.body, name: req.query["name"] ?? "")
            respond(.json(["path": url.path, "name": url.lastPathComponent, "mime": mime, "size": req.body.count]))
        } catch {
            respond(.text(500, "write failed: \(error.localizedDescription)"))
        }
    }
}
