package app.deepfix.dive.export;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.net.Uri;
import android.os.Build;
import android.os.ext.SdkExtensions;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import android.webkit.WebView;
import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * `DiveNative` Capacitor plugin (contract: apps/studio/src/native/plugin.ts).
 * Control calls arrive over the bridge; frames and file uploads go to the
 * loopback endpoint owned by {@link ExportHub}.
 */
@CapacitorPlugin(name = "DiveNative")
public class DiveNativePlugin extends Plugin implements ExportService.Listener {
    private ExportHub hub;
    private final Map<String, Long> started = new ConcurrentHashMap<>();
    private final Map<String, String> titles = new ConcurrentHashMap<>();

    @Override
    public void load() {
        File cache = getContext().getCacheDir();
        // Imports and shared uploads from earlier launches are not referenced any more.
        deleteTree(new File(cache, "imports"));
        deleteTree(new File(cache, "shared"));
        hub = new ExportHub(new File(cache, "exports"), new File(cache, "shared"));
        hub.setProgressListener((id, frames, fraction) -> {
            ExportService.update(getContext(), id, fraction, Math.round(fraction * 100) + " % · " + frames + " frames");
            JSObject ev = new JSObject();
            ev.put("id", id);
            ev.put("frames", frames);
            ev.put("progress", fraction);
            notifyListeners("exportProgress", ev);
        });
        ExportService.listener = this;
    }

    private void ensureServer() throws IOException {
        hub.server.start();
    }

    // ------------------------------------------------------------ info

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            ensureServer();
        } catch (IOException e) {
            call.reject("Loopback endpoint failed: " + e.getMessage());
            return;
        }
        JSObject enc = new JSObject();
        enc.put("avc", hasEncoder("video/avc"));
        enc.put("hevc", hasEncoder("video/hevc"));
        JSArray formats = new JSArray();
        for (PixelFormat f : PixelFormat.values()) formats.put(f.name());
        JSObject ret = new JSObject();
        ret.put("platform", "android");
        ret.put("osVersion", Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        ret.put("encoders", enc);
        ret.put("background", "foreground-service");
        ret.put("frameFormats", formats);
        ret.put("endpoint", hub.server.endpoint());
        ret.put("token", hub.server.token);
        call.resolve(ret);
    }

    private static boolean hasEncoder(String mime) {
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
            if (!info.isEncoder()) continue;
            for (String t : info.getSupportedTypes()) if (t.equalsIgnoreCase(mime)) return true;
        }
        return false;
    }

    // ------------------------------------------------------------ picking

    private static boolean photoPickerAvailable() {
        if (Build.VERSION.SDK_INT >= 33) return true;
        return Build.VERSION.SDK_INT >= 30 && SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 2;
    }

    @PluginMethod
    public void pickMedia(PluginCall call) {
        String source = call.getString("source", "photos");
        JSArray kinds = call.getArray("kinds", new JSArray());
        boolean video = kinds.length() == 0 || kinds.toString().contains("video");
        boolean image = kinds.length() == 0 || kinds.toString().contains("image");
        Intent intent;
        if ("photos".equals(source) && photoPickerAvailable()) {
            // System photo picker: originals, no storage permission.
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
            if (video && !image) intent.setType("video/*");
            else if (image && !video) intent.setType("image/*");
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            String[] mimes = video && image ? new String[] {"video/*", "image/*"} : video ? new String[] {"video/*"} : new String[] {"image/*"};
            intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes);
        }
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("files", new JSArray());
            call.resolve(ret);
            return;
        }
        Uri uri = data.getData();
        new Thread(() -> {
            try {
                JSObject f = importUri(uri);
                JSArray files = new JSArray();
                files.put(f);
                JSObject ret = new JSObject();
                ret.put("files", files);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Import failed: " + e.getMessage());
            }
        }, "dive-import").start();
    }

    /** Copies a picked content:// item into cache/imports so both the WebView and MediaExtractor can read it by path. */
    private JSObject importUri(Uri uri) throws IOException {
        ContentResolver cr = getContext().getContentResolver();
        String name = null;
        try (Cursor c = cr.query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (RuntimeException ignored) {
        }
        String mime = cr.getType(uri);
        if (name == null || name.isEmpty()) {
            String ext = mime != null ? MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) : null;
            name = "clip" + (ext != null ? "." + ext : "");
        }
        name = ExportHub.sanitize(name, "clip");
        File dir = new File(new File(getContext().getCacheDir(), "imports"), UUID.randomUUID().toString());
        if (!dir.mkdirs()) throw new IOException("mkdir failed");
        File dst = new File(dir, name);
        try (InputStream in = cr.openInputStream(uri); OutputStream out = new FileOutputStream(dst)) {
            if (in == null) throw new IOException("cannot open " + uri);
            GallerySaver.copy(in, out);
        }
        if (mime == null) {
            String ext = MimeTypeMap.getFileExtensionFromUrl(name);
            mime = ext != null ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase()) : null;
        }
        JSObject f = new JSObject();
        f.put("path", dst.getAbsolutePath());
        f.put("name", name);
        f.put("mime", mime != null ? mime : "application/octet-stream");
        f.put("size", dst.length());
        return f;
    }

    // ------------------------------------------------------------ export

    @PluginMethod
    public void startExport(PluginCall call) {
        Integer width = call.getInt("width"), height = call.getInt("height");
        if (width == null || height == null || width < 2 || height < 2) {
            call.reject("width/height required");
            return;
        }
        try {
            ensureServer();
        } catch (IOException e) {
            call.reject("Loopback endpoint failed: " + e.getMessage());
            return;
        }
        String id = UUID.randomUUID().toString().substring(0, 8);
        FrameEncoder.Config c = new FrameEncoder.Config();
        c.output = hub.outputFile(call.getString("outputName", "export.mp4"));
        c.width = width;
        c.height = height;
        c.fps = call.getDouble("fps", 30.0);
        c.bitrate = call.getInt("bitrate", 20_000_000);
        c.codec = call.getString("codec", "avc");
        c.keyFrameIntervalSec = call.getDouble("keyFrameIntervalSec", 2.0);
        c.durationSec = call.getDouble("durationSec", 0.0);
        JSObject audio = call.getObject("audio", null);
        if (audio != null && audio.has("path")) {
            c.audioSource = audio.getString("path");
            c.audioShiftSec = audio.optDouble("shiftSec", 0);
        }
        try {
            hub.begin(id, c);
        } catch (Exception e) {
            call.reject("Could not start the encoder: " + e.getMessage());
            return;
        }
        String title = call.getString("title", "Exporting video");
        started.put(id, System.currentTimeMillis());
        titles.put(id, title);
        startBackground(id, title);
        JSObject ret = new JSObject();
        ret.put("id", id);
        ret.put("endpoint", hub.server.endpoint());
        ret.put("token", hub.server.token);
        ret.put("maxInFlight", 1);
        call.resolve(ret);
    }

    private void startBackground(String id, String title) {
        Activity a = getActivity();
        if (Build.VERSION.SDK_INT >= 33 && a != null
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            // Not awaited: without it the service still runs, only the notification is hidden.
            ActivityCompat.requestPermissions(a, new String[] {Manifest.permission.POST_NOTIFICATIONS}, 4102);
        }
        try {
            ExportService.start(getContext(), id, title);
            state(id, "background-granted", null);
        } catch (RuntimeException e) {
            // e.g. ForegroundServiceStartNotAllowedException when not in the foreground.
            state(id, "background-denied", e.getMessage());
        }
        // Keep the WebView renderer at our priority while it is hidden, or the
        // system may kill it in the background mid-export.
        if (Build.VERSION.SDK_INT >= 26 && a != null) {
            a.runOnUiThread(() -> {
                WebView wv = getBridge().getWebView();
                if (wv != null) wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            });
        }
    }

    private void endBackground(String id) {
        titles.remove(id);
        ExportService.stop(getContext(), id);
    }

    /** Bridge fallback for frames (base64 in JSON: slow, only used when the page can't reach the loopback endpoint). */
    @PluginMethod
    public void appendFrame(PluginCall call) {
        String id = call.getString("id");
        Integer seq = call.getInt("seq"), w = call.getInt("w"), h = call.getInt("h");
        Double pts = call.getDouble("pts");
        PixelFormat fmt = PixelFormat.parse(call.getString("fmt"));
        String data = call.getString("data");
        if (id == null || seq == null || w == null || h == null || pts == null || fmt == null || data == null) {
            call.reject("id/seq/pts/w/h/fmt/data required");
            return;
        }
        byte[] bytes = android.util.Base64.decode(data, android.util.Base64.DEFAULT);
        java.nio.ByteBuffer buf = java.nio.ByteBuffer.allocateDirect(bytes.length);
        buf.put(bytes).flip();
        try {
            hub.appendFrame(id, seq, Math.round(pts), w, h, fmt, buf);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void finishExport(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id required");
            return;
        }
        try {
            FrameEncoder.Result r = hub.finish(id);
            Long t0 = started.remove(id);
            JSObject ret = new JSObject();
            ret.put("path", r.file.getAbsolutePath());
            ret.put("name", r.file.getName());
            ret.put("mime", "video/mp4");
            ret.put("size", r.file.length());
            ret.put("frames", r.frames);
            ret.put("durationSec", r.durationSec);
            ret.put("audioIncluded", r.audioIncluded);
            ret.put("elapsedMs", t0 != null ? System.currentTimeMillis() - t0 : 0);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Export failed: " + e.getMessage());
        } finally {
            endBackground(id);
        }
    }

    @PluginMethod
    public void cancelExport(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            hub.cancel(id);
            started.remove(id);
            endBackground(id);
        }
        call.resolve();
    }

    @PluginMethod
    public void setExportStatus(PluginCall call) {
        String id = call.getString("id");
        if (id != null) ExportService.update(getContext(), id, call.getDouble("progress", 0.0), call.getString("subtitle"));
        call.resolve();
    }

    // ------------------------------------------------------------ files

    @PluginMethod
    public void saveToGallery(PluginCall call) {
        String path = call.getString("path");
        if (path == null || !new File(path).isFile()) {
            call.reject("No such file");
            return;
        }
        boolean video = !"photo".equals(call.getString("kind"));
        if (Build.VERSION.SDK_INT < 29
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            Activity a = getActivity();
            if (a != null) ActivityCompat.requestPermissions(a, new String[] {Manifest.permission.WRITE_EXTERNAL_STORAGE}, 4103);
            JSObject ret = new JSObject();
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        String album = call.getString("album", "Exports");
        new Thread(() -> {
            try {
                GallerySaver.save(getContext(), new File(path), video, album, video ? "video/mp4" : "image/jpeg");
                JSObject ret = new JSObject();
                ret.put("saved", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Saving to the gallery failed: " + e.getMessage());
            }
        }, "dive-gallery").start();
    }

    /** Small files from base64 (fallback when the page can't reach the loopback endpoint). */
    @PluginMethod
    public void writeFile(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("data required");
            return;
        }
        String name = ExportHub.sanitize(call.getString("name"), "file.bin");
        String mime = call.getString("mime", "application/octet-stream");
        try {
            File dir = new File(hub.filesDir, UUID.randomUUID().toString());
            if (!dir.mkdirs()) throw new IOException("mkdir failed");
            File f = new File(dir, name);
            try (OutputStream out = new FileOutputStream(f)) {
                out.write(android.util.Base64.decode(data, android.util.Base64.DEFAULT));
            }
            JSObject ret = new JSObject();
            ret.put("path", f.getAbsolutePath());
            ret.put("name", name);
            ret.put("mime", mime);
            ret.put("size", f.length());
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Write failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void removeFile(PluginCall call) {
        String path = call.getString("path");
        try {
            File f = new File(path == null ? "" : path).getCanonicalFile();
            if (!f.getPath().startsWith(getContext().getCacheDir().getCanonicalPath())) {
                call.reject("Not an app file");
                return;
            }
            //noinspection ResultOfMethodCallIgnored
            f.delete();
            call.resolve();
        } catch (IOException e) {
            call.reject(e.getMessage());
        }
    }

    // ------------------------------------------------------------ lifecycle / service

    private void state(String id, String state, String message) {
        JSObject ev = new JSObject();
        ev.put("id", id);
        ev.put("state", state);
        if (message != null) ev.put("message", message);
        notifyListeners("exportState", ev);
    }

    @Override
    protected void handleOnPause() {
        for (String id : titles.keySet()) state(id, "paused", null);
    }

    @Override
    protected void handleOnResume() {
        for (String id : titles.keySet()) state(id, "resumed", null);
    }

    @Override
    public void onCancelRequested(String exportId) {
        hub.cancel(exportId);
        started.remove(exportId);
        titles.remove(exportId);
        state(exportId, "cancelled-by-user", null);
    }

    @Override
    public void onTimeout(String exportId) {
        hub.cancel(exportId);
        started.remove(exportId);
        titles.remove(exportId);
        state(exportId, "background-expired", "Android stopped the background export (time limit)");
    }

    @Override
    protected void handleOnDestroy() {
        hub.cancelAll();
        ExportService.stop(getContext(), null);
        hub.server.stop();
        if (ExportService.listener == this) ExportService.listener = null;
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
