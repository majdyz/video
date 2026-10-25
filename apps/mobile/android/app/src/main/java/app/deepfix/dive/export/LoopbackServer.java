package app.deepfix.dive.export;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * HTTP/1.1 server on 127.0.0.1 (random port) the WebView posts raw frames
 * and files to. The Capacitor bridge would carry every byte as base64 in a
 * JSON string (a 4K RGBA frame is 33 MB); the loopback socket moves it once.
 * One thread per connection; requests on a connection are handled in order
 * and the response is written only after the handler returned, which is the
 * web side's backpressure.
 */
public final class LoopbackServer {
    public interface Handler {
        /** `body` is limited to the request's Content-Length; unread bytes are skipped afterwards. */
        Http.Response handle(Http.Request request, Http.BodyStream body) throws Exception;
    }

    public final String token;
    private final Handler handler;
    private final long maxBody;
    private ServerSocket socket;
    private Thread acceptor;
    private final Set<Socket> open = Collections.synchronizedSet(new HashSet<>());

    public LoopbackServer(String token, long maxBody, Handler handler) {
        this.token = token;
        this.maxBody = maxBody;
        this.handler = handler;
    }

    public static String makeToken() {
        byte[] b = new byte[24];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    public synchronized int start() throws IOException {
        if (socket != null) return socket.getLocalPort();
        ServerSocket s = new ServerSocket();
        s.setReuseAddress(true);
        s.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 8);
        socket = s;
        acceptor = new Thread(this::acceptLoop, "dive-loopback");
        acceptor.setDaemon(true);
        acceptor.start();
        return s.getLocalPort();
    }

    public synchronized int port() {
        return socket == null ? 0 : socket.getLocalPort();
    }

    public String endpoint() {
        return "http://127.0.0.1:" + port();
    }

    public synchronized void stop() {
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
        }
        socket = null;
        synchronized (open) {
            for (Socket c : open) {
                try {
                    c.close();
                } catch (IOException ignored) {
                }
            }
            open.clear();
        }
    }

    private void acceptLoop() {
        ServerSocket s;
        synchronized (this) {
            s = socket;
        }
        while (s != null && !s.isClosed()) {
            try {
                Socket c = s.accept();
                c.setTcpNoDelay(true);
                c.setReceiveBufferSize(1 << 20);
                open.add(c);
                Thread t = new Thread(() -> serve(c), "dive-loopback-conn");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                return;
            }
        }
    }

    private void serve(Socket c) {
        try (Socket sock = c) {
            InputStream in = new BufferedInputStream(sock.getInputStream(), 1 << 20);
            OutputStream out = sock.getOutputStream();
            while (true) {
                String head = Http.readHead(in);
                if (head == null) return;
                Http.Request req;
                try {
                    req = Http.parseHead(head, maxBody);
                } catch (Http.ParseException e) {
                    out.write(Http.Response.text(e.status, e.getMessage()).serialize(false));
                    out.flush();
                    return;
                }
                Http.BodyStream body = new Http.BodyStream(in, req.contentLength);
                Http.Response res;
                if (req.method.equals("OPTIONS")) {
                    res = new Http.Response(204, "text/plain", new byte[0]);
                } else if (!token.equals(req.q("token"))) {
                    res = Http.Response.text(403, "Bad token");
                } else {
                    try {
                        res = handler.handle(req, body);
                    } catch (Exception e) {
                        res = Http.Response.text(500, String.valueOf(e.getMessage()));
                    }
                }
                body.drain();
                boolean keep = req.keepAlive();
                out.write(res.serialize(keep));
                out.flush();
                if (!keep) return;
            }
        } catch (IOException ignored) {
            // client went away
        } finally {
            open.remove(c);
        }
    }
}
