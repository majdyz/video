package app.deepfix.dive.export;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Copies a finished export into the shared gallery: MediaStore with
 * RELATIVE_PATH Movies/<album> or Pictures/<album> on Android 10+ (no
 * permission needed), the public directory + media scan before that
 * (WRITE_EXTERNAL_STORAGE, maxSdkVersion 28).
 */
public final class GallerySaver {
    private GallerySaver() {}

    public static Uri save(Context ctx, File file, boolean video, String album, String mime) throws IOException {
        String safeAlbum = ExportHub.sanitize(album, "Exports");
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = ctx.getContentResolver();
            Uri collection = video
                ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, file.getName());
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES) + "/" + safeAlbum);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = cr.insert(collection, v);
            if (uri == null) throw new IOException("MediaStore insert failed");
            try (InputStream in = new FileInputStream(file); OutputStream out = cr.openOutputStream(uri)) {
                if (out == null) throw new IOException("MediaStore stream failed");
                copy(in, out);
            } catch (IOException e) {
                cr.delete(uri, null, null);
                throw e;
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, done, null, null);
            return uri;
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES), safeAlbum);
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cannot create " + dir);
        File dst = new File(dir, file.getName());
        try (InputStream in = new FileInputStream(file); OutputStream out = new FileOutputStream(dst)) {
            copy(in, out);
        }
        MediaScannerConnection.scanFile(ctx, new String[] {dst.getAbsolutePath()}, new String[] {mime}, null);
        return Uri.fromFile(dst);
    }

    static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[1 << 20];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }
}
