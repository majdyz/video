import Foundation

/// One HTTP/1.1 request as the loopback endpoint sees it.
public struct HTTPRequest {
    public var method: String
    /// Path without the query string, percent-decoded.
    public var path: String
    public var query: [String: String]
    /// Header names lower-cased.
    public var headers: [String: String]
    public var body: Data

    public var keepAlive: Bool {
        (headers["connection"]?.lowercased() ?? "keep-alive") != "close"
    }
}

public struct HTTPResponse {
    public var status: Int
    public var contentType: String
    public var body: Data

    public init(status: Int, contentType: String = "text/plain; charset=utf-8", body: Data = Data()) {
        self.status = status
        self.contentType = contentType
        self.body = body
    }

    public static func text(_ status: Int, _ text: String) -> HTTPResponse {
        HTTPResponse(status: status, body: Data(text.utf8))
    }

    public static func json(_ object: Any) -> HTTPResponse {
        let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
        return HTTPResponse(status: 200, contentType: "application/json", body: data)
    }

    static func reason(_ status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 204: return "No Content"
        case 400: return "Bad Request"
        case 403: return "Forbidden"
        case 404: return "Not Found"
        case 409: return "Conflict"
        case 411: return "Length Required"
        case 413: return "Payload Too Large"
        default: return status >= 500 ? "Internal Server Error" : "Error"
        }
    }

    /// Serialised response. CORS is open (`*`): the endpoint only listens on
    /// 127.0.0.1 and every route checks the per-launch token.
    public func serialized(keepAlive: Bool) -> Data {
        var head = "HTTP/1.1 \(status) \(HTTPResponse.reason(status))\r\n"
        head += "Content-Type: \(contentType)\r\n"
        head += "Content-Length: \(body.count)\r\n"
        head += "Access-Control-Allow-Origin: *\r\n"
        head += "Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n"
        head += "Access-Control-Allow-Headers: content-type\r\n"
        head += "Access-Control-Max-Age: 600\r\n"
        head += "Cache-Control: no-store\r\n"
        head += "Connection: \(keepAlive ? "keep-alive" : "close")\r\n\r\n"
        var out = Data(head.utf8)
        out.append(body)
        return out
    }
}

public enum HTTPParseError: Error, Equatable {
    case malformed(String)
    case lengthRequired
    case tooLarge(Int)
}

/// Incremental request parser: feed bytes as they arrive, take complete
/// requests out. Supports Content-Length bodies only (fetch sends one for
/// ArrayBuffer and Blob bodies); chunked uploads are rejected.
public struct HTTPRequestParser {
    public let maxBody: Int
    private var buffer = Data()
    private var pendingHead: (method: String, target: String, headers: [String: String], length: Int)?

    public init(maxBody: Int = 512 * 1024 * 1024) {
        self.maxBody = maxBody
    }

    public mutating func append(_ data: Data) {
        buffer.append(data)
    }

    /// Bytes still needed for the request being read (0 when unknown).
    public var bytesWanted: Int {
        guard let head = pendingHead else { return 0 }
        return max(0, head.length - buffer.count)
    }

    /// Returns the next complete request, nil when more bytes are needed.
    public mutating func next() throws -> HTTPRequest? {
        if pendingHead == nil {
            guard let end = buffer.range(of: Data("\r\n\r\n".utf8)) else {
                if buffer.count > 64 * 1024 { throw HTTPParseError.malformed("header too large") }
                return nil
            }
            let headData = buffer.subdata(in: buffer.startIndex..<end.lowerBound)
            buffer.removeSubrange(buffer.startIndex..<end.upperBound)
            guard let head = String(data: headData, encoding: .utf8) else { throw HTTPParseError.malformed("header encoding") }
            var lines = head.components(separatedBy: "\r\n")
            let requestLine = lines.removeFirst().split(separator: " ")
            guard requestLine.count >= 2 else { throw HTTPParseError.malformed("request line") }
            var headers: [String: String] = [:]
            for line in lines where !line.isEmpty {
                guard let colon = line.firstIndex(of: ":") else { throw HTTPParseError.malformed("header line") }
                let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
                let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
                headers[name] = value
            }
            if headers["transfer-encoding"]?.lowercased().contains("chunked") == true { throw HTTPParseError.lengthRequired }
            let method = String(requestLine[0]).uppercased()
            let length: Int
            if let cl = headers["content-length"] {
                guard let n = Int(cl), n >= 0 else { throw HTTPParseError.malformed("content-length") }
                length = n
            } else if method == "POST" || method == "PUT" {
                throw HTTPParseError.lengthRequired
            } else {
                length = 0
            }
            if length > maxBody { throw HTTPParseError.tooLarge(length) }
            pendingHead = (method, String(requestLine[1]), headers, length)
            buffer.reserveCapacity(length)
        }
        guard let head = pendingHead, buffer.count >= head.length else { return nil }
        let body = buffer.subdata(in: buffer.startIndex..<(buffer.startIndex + head.length))
        buffer.removeSubrange(buffer.startIndex..<(buffer.startIndex + head.length))
        pendingHead = nil
        let (path, query) = HTTPRequestParser.splitTarget(head.target)
        return HTTPRequest(method: head.method, path: path, query: query, headers: head.headers, body: body)
    }

    static func splitTarget(_ target: String) -> (String, [String: String]) {
        let parts = target.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let path = String(parts[0]).removingPercentEncoding ?? String(parts[0])
        var query: [String: String] = [:]
        if parts.count > 1 {
            for pair in parts[1].split(separator: "&") {
                let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
                let k = String(kv[0]).replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? String(kv[0])
                let v = kv.count > 1 ? (String(kv[1]).replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? String(kv[1])) : ""
                query[k] = v
            }
        }
        return (path, query)
    }
}
