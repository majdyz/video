package app.deepfix.dive.export;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Minimal HTTP/1.1 message types for the loopback endpoint (no Android dependencies: unit-tested on the JVM). */
public final class Http {
    private Http() {}

    public static final int MAX_HEAD = 64 * 1024;

    public static final class Request {
        public final String method;
        public final String path;
        public final Map<String, String> query;
        public final Map<String, String> headers;
        public final long contentLength;

        Request(String method, String path, Map<String, String> query, Map<String, String> headers, long contentLength) {
            this.method = method;
            this.path = path;
            this.query = query;
            this.headers = headers;
            this.contentLength = contentLength;
        }

        public boolean keepAlive() {
            String c = headers.get("connection");
            return c == null || !c.equalsIgnoreCase("close");
        }

        public String q(String key) {
            return query.get(key);
        }
    }

    public static final class Response {
        public final int status;
        public final String contentType;
        public final byte[] body;

        public Response(int status, String contentType, byte[] body) {
            this.status = status;
            this.contentType = contentType;
            this.body = body;
        }

        public static Response text(int status, String text) {
            return new Response(status, "text/plain; charset=utf-8", text.getBytes(StandardCharsets.UTF_8));
        }

        public static Response json(String json) {
            return new Response(200, "application/json", json.getBytes(StandardCharsets.UTF_8));
        }

        /** Head + body. CORS is open: the socket only listens on 127.0.0.1 and every route checks the token. */
        public byte[] serialize(boolean keepAlive) {
            String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n"
                + "Access-Control-Allow-Headers: content-type\r\n"
                + "Access-Control-Max-Age: 600\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: " + (keepAlive ? "keep-alive" : "close") + "\r\n\r\n";
            byte[] h = head.getBytes(StandardCharsets.US_ASCII);
            byte[] out = new byte[h.length + body.length];
            System.arraycopy(h, 0, out, 0, h.length);
            System.arraycopy(body, 0, out, h.length, body.length);
            return out;
        }

        static String reason(int s) {
            switch (s) {
                case 200: return "OK";
                case 204: return "No Content";
                case 400: return "Bad Request";
                case 403: return "Forbidden";
                case 404: return "Not Found";
                case 409: return "Conflict";
                case 411: return "Length Required";
                case 413: return "Payload Too Large";
                default: return s >= 500 ? "Internal Server Error" : "Error";
            }
        }
    }

    public static final class ParseException extends IOException {
        private static final long serialVersionUID = 1L;
        public final int status;

        public ParseException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    /** Reads the request head (up to the blank line). Returns null on a clean end of stream. */
    public static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream(512);
        int state = 0; // matched bytes of \r\n\r\n
        while (true) {
            int b = in.read();
            if (b < 0) {
                if (buf.size() == 0) return null;
                throw new ParseException(400, "truncated head");
            }
            buf.write(b);
            if (buf.size() > MAX_HEAD) throw new ParseException(400, "head too large");
            if ((state == 0 || state == 2) && b == '\r') state++;
            else if ((state == 1 || state == 3) && b == '\n') state++;
            else state = b == '\r' ? 1 : 0;
            if (state == 4) {
                byte[] all = buf.toByteArray();
                return new String(all, 0, all.length - 4, StandardCharsets.UTF_8);
            }
        }
    }

    public static Request parseHead(String head, long maxBody) throws ParseException {
        String[] lines = head.split("\r\n");
        String[] rl = lines[0].split(" ");
        if (rl.length < 2) throw new ParseException(400, "request line");
        Map<String, String> headers = new HashMap<>();
        for (int i = 1; i < lines.length; i++) {
            if (lines[i].isEmpty()) continue;
            int c = lines[i].indexOf(':');
            if (c <= 0) throw new ParseException(400, "header line");
            headers.put(lines[i].substring(0, c).trim().toLowerCase(Locale.ROOT), lines[i].substring(c + 1).trim());
        }
        String method = rl[0].toUpperCase(Locale.ROOT);
        String te = headers.get("transfer-encoding");
        if (te != null && te.toLowerCase(Locale.ROOT).contains("chunked")) throw new ParseException(411, "chunked bodies are not supported");
        long length = 0;
        String cl = headers.get("content-length");
        if (cl != null) {
            try {
                length = Long.parseLong(cl.trim());
            } catch (NumberFormatException e) {
                throw new ParseException(400, "content-length");
            }
            if (length < 0) throw new ParseException(400, "content-length");
        } else if (method.equals("POST") || method.equals("PUT")) {
            throw new ParseException(411, "Content-Length required");
        }
        if (length > maxBody) throw new ParseException(413, "body too large (" + length + ")");
        String target = rl[1];
        int qi = target.indexOf('?');
        String path = decode(qi < 0 ? target : target.substring(0, qi), false);
        Map<String, String> query = new HashMap<>();
        if (qi >= 0) {
            for (String pair : target.substring(qi + 1).split("&")) {
                if (pair.isEmpty()) continue;
                int e = pair.indexOf('=');
                String k = e < 0 ? pair : pair.substring(0, e);
                String v = e < 0 ? "" : pair.substring(e + 1);
                query.put(decode(k, true), decode(v, true));
            }
        }
        return new Request(method, path, query, headers, length);
    }

    static String decode(String s, boolean plusIsSpace) {
        try {
            // URLDecoder turns '+' into ' '; keep literal '+' in paths.
            return URLDecoder.decode(plusIsSpace ? s : s.replace("+", "%2B"), "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    /** Input stream limited to `length` bytes (the request body). */
    public static final class BodyStream extends InputStream {
        private final InputStream in;
        private long remaining;

        public BodyStream(InputStream in, long length) {
            this.in = in;
            this.remaining = length;
        }

        public long remaining() {
            return remaining;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = in.read();
            if (b >= 0) remaining--;
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int n = in.read(b, off, (int) Math.min(len, remaining));
            if (n > 0) remaining -= n;
            return n;
        }

        /** Discards what the handler did not read so the next request starts at the right byte. */
        public void drain() throws IOException {
            byte[] skip = new byte[64 * 1024];
            while (remaining > 0) {
                if (read(skip, 0, skip.length) < 0) throw new IOException("truncated body");
            }
        }
    }
}
