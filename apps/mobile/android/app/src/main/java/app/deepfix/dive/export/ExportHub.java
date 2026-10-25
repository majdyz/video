package app.deepfix.dive.export;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Owns the loopback endpoint and the running exports; the Capacitor plugin
 * is a thin bridge over it. Routes (all need ?token=):
 *   POST /export/{id}/frame?seq=&pts=&dur=&fmt=&w=&h=   raw pixels -> encoder
 *   POST /file?name=&mime=                              body -> filesDir, JSON NativeFile back
 *   GET  /ping
 */
public final class ExportHub {
    public interface ProgressListener {
        void onProgress(String id, int frames, double fraction);
    }

    final class Session {
        final String id;
        final ExecutorService thread;
        final FrameEncoder encoder;
        int nextSeq;
        long lastReport;
        ByteBuffer spare;

        Session(String id, ExecutorService thread, FrameEncoder encoder) {
            this.id = id;
            this.thread = thread;
            this.encoder = encoder;
        }
    }

    public final LoopbackServer server;
    public final File exportsDir;
    public final File filesDir;
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private volatile ProgressListener progress;

    public ExportHub(File exportsDir, File filesDir) {
        this.exportsDir = exportsDir;
        this.filesDir = filesDir;
        //noinspection ResultOfMethodCallIgnored
        exportsDir.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        filesDir.mkdirs();
        server = new LoopbackServer(LoopbackServer.makeToken(), 1L << 30, this::handle);
    }

    public void setProgressListener(ProgressListener l) {
        progress = l;
    }

    public int activeCount() {
        return sessions.size();
    }

    /** A unique, sanitised output file in exportsDir. */
    public File outputFile(String name) {
        String safe = sanitize(name, "export.mp4");
        File f = new File(exportsDir, safe);
        int dot = safe.lastIndexOf('.');
        String stem = dot > 0 ? safe.substring(0, dot) : safe, ext = dot > 0 ? safe.substring(dot) : "";
        for (int n = 2; f.exists(); n++) f = new File(exportsDir, stem + "-" + n + ext);
        return f;
    }

    static String sanitize(String name, String fallback) {
        if (name == null) return fallback;
        StringBuilder sb = new StringBuilder();
        for (char c : name.toCharArray()) sb.append(Character.isLetterOrDigit(c) || c == '-' || c == '_' || c == '.' || c == ' ' ? c : '_');
        String s = sb.toString().replaceAll("^[. ]+|[. ]+$", "");
        if (s.isEmpty()) return fallback;
        return s.length() > 120 ? s.substring(0, 120) : s;
    }

    /** Creates the encoder on the session's own thread (it owns the EGL context). */
    public void begin(String id, FrameEncoder.Config config) throws Exception {
        ExecutorService t = Executors.newSingleThreadExecutor(r -> {
            Thread th = new Thread(r, "dive-encoder-" + id);
            th.setPriority(Thread.NORM_PRIORITY + 1);
            return th;
        });
        try {
            FrameEncoder enc = t.submit(() -> new FrameEncoder(config)).get();
            sessions.put(id, new Session(id, t, enc));
        } catch (ExecutionException e) {
            t.shutdown();
            throw unwrap(e);
        }
    }

    public FrameEncoder.Result finish(String id) throws Exception {
        Session s = sessions.remove(id);
        if (s == null) throw new IllegalStateException("no export " + id);
        try {
            return s.thread.submit(s.encoder::finish).get();
        } catch (ExecutionException e) {
            throw unwrap(e);
        } finally {
            s.thread.shutdown();
        }
    }

    public void cancel(String id) {
        Session s = sessions.remove(id);
        if (s == null) return;
        s.thread.execute(s.encoder::cancel);
        s.thread.shutdown();
    }

    public void cancelAll() {
        for (String id : sessions.keySet()) cancel(id);
    }

    private static Exception unwrap(ExecutionException e) {
        Throwable c = e.getCause();
        return c instanceof Exception ? (Exception) c : new RuntimeException(c);
    }

    // ------------------------------------------------------------ routes

    Http.Response handle(Http.Request req, Http.BodyStream body) throws Exception {
        String[] parts = req.path.replaceAll("^/+|/+$", "").split("/");
        if (req.method.equals("POST") && parts.length == 3 && parts[0].equals("export") && parts[2].equals("frame")) {
            return frame(parts[1], req, body);
        }
        if (req.method.equals("POST") && parts.length == 1 && parts[0].equals("file")) return file(req, body);
        if (req.method.equals("GET") && parts.length == 1 && parts[0].equals("ping")) return Http.Response.text(200, "ok");
        return Http.Response.text(404, "no route " + req.method + " " + req.path);
    }

    private Http.Response frame(String id, Http.Request req, Http.BodyStream body) throws Exception {
        Session s = sessions.get(id);
        if (s == null) return Http.Response.text(404, "no export " + id);
        int seq, w, h;
        long pts;
        PixelFormat fmt = PixelFormat.parse(req.q("fmt"));
        try {
            seq = Integer.parseInt(req.q("seq"));
            w = Integer.parseInt(req.q("w"));
            h = Integer.parseInt(req.q("h"));
            pts = Long.parseLong(req.q("pts"));
        } catch (RuntimeException e) {
            return Http.Response.text(400, "missing seq/pts/w/h");
        }
        if (fmt == null) return Http.Response.text(400, "fmt must be RGBA, RGBX, BGRA or BGRX");
        long need = (long) w * h * 4;
        if (req.contentLength != need) return Http.Response.text(400, "body is " + req.contentLength + " bytes, " + w + "x" + h + " needs " + need);
        if (seq != s.nextSeq) return Http.Response.text(409, "expected frame " + s.nextSeq + ", got " + seq);
        ByteBuffer buf = s.spare != null && s.spare.capacity() == need ? s.spare : ByteBuffer.allocateDirect((int) need);
        s.spare = null;
        readFully(body, buf);
        try {
            appendFrame(id, seq, pts, w, h, fmt, buf);
        } catch (FrameError e) {
            return Http.Response.text(e.status, e.getMessage());
        }
        s.spare = buf;
        return Http.Response.text(200, "ok");
    }

    /** 4xx outcome of a frame (unknown export, wrong size, out of order). */
    public static final class FrameError extends Exception {
        private static final long serialVersionUID = 1L;
        public final int status;

        FrameError(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    /**
     * Hands one frame to the encoder thread and waits until it is encoded
     * (shared by the loopback route and the bridge fallback). `pixels` is
     * read from position 0 and may be reused once this returns.
     */
    public void appendFrame(String id, int seq, long pts, int w, int h, PixelFormat fmt, ByteBuffer pixels) throws Exception {
        Session s = sessions.get(id);
        if (s == null) throw new FrameError(404, "no export " + id);
        if (pixels.limit() != (long) w * h * 4) throw new FrameError(400, "frame is " + pixels.limit() + " bytes, " + w + "x" + h + " needs " + ((long) w * h * 4));
        synchronized (s) {
            if (seq != s.nextSeq) throw new FrameError(409, "expected frame " + s.nextSeq + ", got " + seq);
            try {
                s.thread.submit(() -> {
                    s.encoder.append(pixels, w, h, fmt, pts);
                    return null;
                }).get();
            } catch (ExecutionException e) {
                throw unwrap(e);
            }
            s.nextSeq++;
        }
        long now = System.currentTimeMillis();
        ProgressListener l = progress;
        if (l != null && now - s.lastReport > 250) {
            s.lastReport = now;
            double dur = s.encoder.config.durationSec;
            l.onProgress(id, s.encoder.frames(), dur > 0 ? Math.min(1, pts / 1e6 / dur) : 0);
        }
    }

    private static void readFully(InputStream in, ByteBuffer dst) throws IOException {
        dst.clear();
        byte[] chunk = new byte[256 * 1024];
        while (dst.hasRemaining()) {
            int n = in.read(chunk, 0, Math.min(chunk.length, dst.remaining()));
            if (n < 0) throw new IOException("truncated frame");
            dst.put(chunk, 0, n);
        }
        dst.flip();
    }

    private Http.Response file(Http.Request req, Http.BodyStream body) throws IOException {
        String name = sanitize(req.q("name"), "file.bin");
        String mime = req.q("mime") != null ? req.q("mime") : "application/octet-stream";
        File dir = new File(filesDir, UUID.randomUUID().toString());
        if (!dir.mkdirs()) throw new IOException("mkdir failed");
        File f = new File(dir, name);
        long size = 0;
        try (OutputStream out = new FileOutputStream(f)) {
            byte[] chunk = new byte[256 * 1024];
            int n;
            while ((n = body.read(chunk, 0, chunk.length)) > 0) {
                out.write(chunk, 0, n);
                size += n;
            }
        }
        return Http.Response.json("{\"path\":" + jsonString(f.getAbsolutePath()) + ",\"name\":" + jsonString(name) + ",\"mime\":" + jsonString(mime) + ",\"size\":" + size + "}");
    }

    static String jsonString(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') sb.append('\\').append(c);
            else if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
        return sb.append('"').toString();
    }
}
