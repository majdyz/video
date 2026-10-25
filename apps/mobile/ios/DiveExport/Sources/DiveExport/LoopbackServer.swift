import Foundation
import Network
import Security

/// Minimal HTTP/1.1 server on 127.0.0.1 (random port) that the WebView posts
/// raw frames and files to. The Capacitor bridge would base64 every byte
/// through JSON (a 4K RGBA frame is 33 MB); a loopback socket moves the
/// bytes once. Requests on one connection are handled strictly in order:
/// the next request is read only after the handler responded, which gives
/// the web side natural backpressure.
public final class LoopbackServer {
    /// The handler must call `respond` exactly once, on any thread.
    public typealias Handler = (_ request: HTTPRequest, _ respond: @escaping (HTTPResponse) -> Void) -> Void

    public let token: String
    /// Diagnostics hook (tests print it): connection states, reads, responses.
    public static var debugLog: ((String) -> Void)?
    private func log(_ s: @autoclosure () -> String) { LoopbackServer.debugLog?(s()) }
    private let handler: Handler
    private let queue = DispatchQueue(label: "dive.loopback", qos: .userInitiated)
    private var listener: NWListener?
    private var connections: [ObjectIdentifier: Connection] = [:]
    public private(set) var port: UInt16 = 0

    public init(token: String = LoopbackServer.makeToken(), handler: @escaping Handler) {
        self.token = token
        self.handler = handler
    }

    public static func makeToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 24)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    public var endpoint: String { "http://127.0.0.1:\(port)" }

    /// Starts listening; completes with the port (on the server queue).
    public func start(completion: @escaping (Result<UInt16, Error>) -> Void) {
        queue.async {
            if self.port != 0 { completion(.success(self.port)); return }
            do {
                let params = NWParameters.tcp
                params.allowLocalEndpointReuse = true
                params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: .any)
                params.acceptLocalOnly = true
                let listener = try NWListener(using: params)
                var done = false
                listener.stateUpdateHandler = { [weak self] state in
                    guard let self else { return }
                    switch state {
                    case .ready:
                        self.port = listener.port?.rawValue ?? 0
                        if !done { done = true; completion(.success(self.port)) }
                    case .failed(let error):
                        self.port = 0
                        if !done { done = true; completion(.failure(error)) }
                    default:
                        break
                    }
                }
                listener.newConnectionHandler = { [weak self] nw in self?.accept(nw) }
                listener.start(queue: self.queue)
                self.listener = listener
            } catch {
                completion(.failure(error))
            }
        }
    }

    public func stop() {
        queue.async {
            self.listener?.cancel()
            self.listener = nil
            self.port = 0
            for c in self.connections.values { c.nw.cancel() }
            self.connections.removeAll()
        }
    }

    private func accept(_ nw: NWConnection) {
        let conn = Connection(nw: nw)
        let key = ObjectIdentifier(conn)
        connections[key] = conn
        log("accept \(nw.endpoint)")
        nw.stateUpdateHandler = { [weak self] state in
            self?.log("conn state \(state)")
            switch state {
            case .failed, .cancelled:
                self?.queue.async { self?.connections[key] = nil }
            default:
                break
            }
        }
        nw.start(queue: queue)
        receive(conn)
    }

    private func receive(_ conn: Connection) {
        // Large reads: frames are megabytes.
        conn.nw.receive(minimumIncompleteLength: 1, maximumLength: 4 * 1024 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            self.log("recv \(data?.count ?? -1) bytes complete=\(isComplete) error=\(String(describing: error))")
            if let data, !data.isEmpty { conn.parser.append(data) }
            do {
                if let request = try conn.parser.next() {
                    self.dispatch(request, on: conn)
                    return
                }
            } catch HTTPParseError.lengthRequired {
                self.send(.text(411, "Content-Length required"), on: conn, keepAlive: false)
                return
            } catch HTTPParseError.tooLarge(let n) {
                self.send(.text(413, "Body too large (\(n) bytes)"), on: conn, keepAlive: false)
                return
            } catch {
                self.send(.text(400, "Bad request"), on: conn, keepAlive: false)
                return
            }
            if isComplete || error != nil {
                conn.nw.cancel()
                return
            }
            self.receive(conn)
        }
    }

    private func dispatch(_ request: HTTPRequest, on conn: Connection) {
        let keepAlive = request.keepAlive
        log("request \(request.method) \(request.path) body=\(request.body.count) keepAlive=\(keepAlive)")
        if request.method == "OPTIONS" {
            send(HTTPResponse(status: 204), on: conn, keepAlive: keepAlive)
            return
        }
        guard request.query["token"] == token else {
            send(.text(403, "Bad token"), on: conn, keepAlive: keepAlive)
            return
        }
        var answered = false
        handler(request) { [weak self] response in
            self?.queue.async {
                guard !answered else { return }
                answered = true
                self?.send(response, on: conn, keepAlive: keepAlive)
            }
        }
    }

    private func send(_ response: HTTPResponse, on conn: Connection, keepAlive: Bool) {
        conn.nw.send(content: response.serialized(keepAlive: keepAlive), completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            self.log("sent \(response.status) error=\(String(describing: error))")
            if error != nil || !keepAlive {
                conn.nw.cancel()
                return
            }
            // Pipelined bytes of the next request may already be buffered.
            self.queue.async {
                do {
                    if let next = try conn.parser.next() {
                        self.dispatch(next, on: conn)
                        return
                    }
                } catch {
                    self.send(.text(400, "Bad request"), on: conn, keepAlive: false)
                    return
                }
                self.receive(conn)
            }
        })
    }

    private final class Connection {
        let nw: NWConnection
        var parser = HTTPRequestParser()
        init(nw: NWConnection) { self.nw = nw }
    }
}
