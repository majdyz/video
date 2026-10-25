package app.deepfix.dive.export;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import app.deepfix.dive.R;

/**
 * Foreground service that keeps the process (and with it the WebView's
 * renderer and the encoder thread) alive while an export runs and the app is
 * in the background, with an ongoing progress notification and a Cancel
 * action. Type mediaProcessing on Android 15+ (6 h budget per 24 h,
 * onTimeout stops it), dataSync on Android 14.
 */
public class ExportService extends Service {
    public interface Listener {
        void onCancelRequested(String exportId);

        void onTimeout(String exportId);
    }

    static final String CHANNEL = "export";
    static final int NOTIFICATION_ID = 4101;
    static final String ACTION_CANCEL = "app.deepfix.dive.export.CANCEL";
    static final String EXTRA_ID = "id";
    static final String EXTRA_TITLE = "title";

    /** Set by the plugin; the service has no other way back to the bridge. */
    static volatile Listener listener;
    private static volatile String currentId;
    private static volatile String currentTitle = "Exporting";

    public static void start(Context ctx, String id, String title) {
        currentId = id;
        currentTitle = title;
        Intent i = new Intent(ctx, ExportService.class).putExtra(EXTRA_ID, id).putExtra(EXTRA_TITLE, title);
        ContextCompat.startForegroundService(ctx, i);
    }

    /** Updates the ongoing notification (cheap: same id, only posted while the service runs). */
    public static void update(Context ctx, String id, double fraction, String text) {
        if (id == null || !id.equals(currentId)) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, build(ctx, id, currentTitle, fraction, text));
    }

    public static void stop(Context ctx, String id) {
        if (id != null && !id.equals(currentId)) return;
        currentId = null;
        ctx.stopService(new Intent(ctx, ExportService.class));
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Exports", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Progress of video exports running in the background");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    static Notification build(Context ctx, String id, String title, double fraction, String text) {
        ensureChannel(ctx);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent cancel = new Intent(ctx, ExportService.class).setAction(ACTION_CANCEL).putExtra(EXTRA_ID, id);
        PendingIntent cancelPi = PendingIntent.getService(ctx, 1, cancel, flags);
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent openPi = open == null ? null : PendingIntent.getActivity(ctx, 2, open, flags);
        int pct = (int) Math.round(Math.max(0, Math.min(1, fraction)) * 100);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_export)
            .setContentTitle(title)
            .setContentText(text != null ? text : pct + " %")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setProgress(100, pct, fraction <= 0)
            .addAction(0, "Cancel", cancelPi);
        if (openPi != null) b.setContentIntent(openPi);
        return b.build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_CANCEL.equals(intent.getAction())) {
            Listener l = listener;
            String id = intent.getStringExtra(EXTRA_ID);
            if (l != null && id != null) l.onCancelRequested(id);
            stopSelf();
            return START_NOT_STICKY;
        }
        String id = intent != null ? intent.getStringExtra(EXTRA_ID) : currentId;
        String title = intent != null && intent.getStringExtra(EXTRA_TITLE) != null ? intent.getStringExtra(EXTRA_TITLE) : currentTitle;
        Notification n = build(this, id, title, 0, "Starting");
        if (Build.VERSION.SDK_INT >= 35) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING);
        } else if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
        // Not restarted by the system: an export can't resume without the page.
        return START_NOT_STICKY;
    }

    /** Android 15: the mediaProcessing budget ran out. */
    @Override
    public void onTimeout(int startId, int fgsType) {
        Listener l = listener;
        String id = currentId;
        if (l != null && id != null) l.onTimeout(id);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
