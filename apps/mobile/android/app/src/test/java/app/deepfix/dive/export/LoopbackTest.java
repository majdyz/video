package app.deepfix.dive.export;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** JVM tests for the loopback endpoint (no Android runtime needed). */
public class LoopbackTest {
    private File root;
    private ExportHub hub;
    private String base;

    @Before
    public void setUp() throws IOException {
        root = Files.createTempDirectory("dive-hub").toFile();
        hub = new ExportHub(new File(root, "exports"), new File(root, "shared"));
        int port = hub.server.start();
        base = "http://127.0.0.1:" + port;
    }

    @After
    public void tearDown() {
        hub.server.stop();
    }

    private static class Res {
        int status;
        String body;
    }

    private Res request(String method, String pathAndQuery, byte[] body) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(base + pathAndQuery).openConnection();
        c.setRequestMethod(method);
        if (body != null) {
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(body.length);
            c.setRequestProperty("content-type", "text/plain");
            try (OutputStream out = c.getOutputStream()) {
                out.write(body);
            }
        }
        Res r = new Res();
        r.status = c.getResponseCode();
        InputStream in = r.status < 400 ? c.getInputStream() : c.getErrorStream();
        r.body = in == null ? "" : new String(readAll(in), StandardCharsets.UTF_8);
        assertEquals("*", c.getHeaderField("Access-Control-Allow-Origin"));
        return r;
    }

    private static byte[] readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] b = new byte[8192];
        int n;
        while ((n = in.read(b)) > 0) out.write(b, 0, n);
        return out.toByteArray();
    }

    @Test
    public void rejectsBadToken() throws IOException {
        assertEquals(403, request("GET", "/ping?token=nope", null).status);
    }

    @Test
    public void pingAndKeepAlive() throws IOException {
        for (int i = 0; i < 5; i++) {
            Res r = request("GET", "/ping?token=" + hub.server.token, null);
            assertEquals(200, r.status);
            assertEquals("ok", r.body);
        }
    }

    @Test
    public void unknownExportIs404() throws IOException {
        Res r = request("POST", "/export/nope/frame?token=" + hub.server.token + "&seq=0&pts=0&fmt=RGBA&w=2&h=2", new byte[16]);
        assertEquals(404, r.status);
    }

    @Test
    public void fileUploadIsSanitisedAndStored() throws IOException {
        byte[] payload = "hello".getBytes(StandardCharsets.UTF_8);
        Res r = request("POST", "/file?token=" + hub.server.token + "&name=..%2F..%2Fevil.jpg&mime=image%2Fjpeg", payload);
        assertEquals(200, r.status);
        assertTrue(r.body, r.body.contains("\"size\":5"));
        assertTrue(r.body.contains("\"mime\":\"image/jpeg\""));
        assertFalse(r.body, r.body.contains("../"));
        String path = r.body.replaceAll(".*\"path\":\"([^\"]+)\".*", "$1");
        File f = new File(path);
        assertTrue(f.getCanonicalPath().startsWith(hub.filesDir.getCanonicalPath()));
        assertEquals("hello", new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
    }

    @Test
    public void parsesHeadAndQuery() throws IOException {
        String raw = "POST /export/a%20b/frame?token=t&seq=3&name=x+y HTTP/1.1\r\nHost: x\r\nContent-Length: 4\r\nConnection: close\r\n\r\nbody";
        InputStream in = new ByteArrayInputStream(raw.getBytes(StandardCharsets.US_ASCII));
        String head = Http.readHead(in);
        assertNotNull(head);
        Http.Request r = Http.parseHead(head, 100);
        assertEquals("POST", r.method);
        assertEquals("/export/a b/frame", r.path);
        assertEquals("3", r.q("seq"));
        assertEquals("x y", r.q("name"));
        assertEquals(4, r.contentLength);
        assertFalse(r.keepAlive());
        Http.BodyStream body = new Http.BodyStream(in, r.contentLength);
        assertEquals('b', body.read());
        body.drain();
        assertEquals(-1, body.read());
        assertNull(Http.readHead(in));
    }

    @Test
    public void rejectsChunkedAndOversized() {
        try {
            Http.parseHead("POST /file HTTP/1.1\r\nTransfer-Encoding: chunked", 100);
            fail();
        } catch (Http.ParseException e) {
            assertEquals(411, e.status);
        }
        try {
            Http.parseHead("POST /file HTTP/1.1\r\nContent-Length: 101", 100);
            fail();
        } catch (Http.ParseException e) {
            assertEquals(413, e.status);
        }
    }

    @Test
    public void helpers() {
        assertEquals(1920, FrameEncoder.even(1921));
        assertEquals(2, FrameEncoder.even(1));
        assertTrue(FrameEncoder.muxableAudio("audio/mp4a-latm"));
        assertFalse(FrameEncoder.muxableAudio("audio/opus"));
        assertEquals("clip-fixed.mp4", ExportHub.sanitize("clip-fixed.mp4", "x"));
        assertEquals("_etc_passwd", ExportHub.sanitize("/etc/passwd", "x"));
        assertEquals("x", ExportHub.sanitize("...", "x"));
        assertEquals(PixelFormat.BGRX, PixelFormat.parse("BGRX"));
        assertNull(PixelFormat.parse("NV12"));
        assertTrue(PixelFormat.BGRA.isBgr());
        File out = hub.outputFile("a.mp4");
        assertEquals("a.mp4", out.getName());
    }
}
