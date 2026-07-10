package com.autoai.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;

public class CallForegroundService extends Service {
    public static final String ACTION_START = "com.autoai.app.call.service.START";
    public static final String ACTION_STOP = "com.autoai.app.call.service.STOP";
    private AudioManager audioManager;
    private int previousAudioMode = AudioManager.MODE_NORMAL;
    private boolean previousSpeakerState;
    private String activeCallId;

    @Override
    public void onCreate() {
        super.onCreate();
        CallNotificationManager.createChannels(this);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            previousAudioMode = audioManager.getMode();
            previousSpeakerState = audioManager.isSpeakerphoneOn();
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        activeCallId = intent.getStringExtra(CallNotificationManager.EXTRA_CALL_ID);
        String displayName = intent.getStringExtra(CallNotificationManager.EXTRA_CALLER_NAME);
        String callType = intent.getStringExtra(CallNotificationManager.EXTRA_CALL_TYPE);
        if (activeCallId == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startForeground(CallNotificationManager.notificationId(activeCallId) + 100000, buildNotification(displayName, callType));
        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (audioManager != null) {
            audioManager.abandonAudioFocus(null);
            audioManager.setSpeakerphoneOn(previousSpeakerState);
            audioManager.setMode(previousAudioMode);
        }
        if (activeCallId != null) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(CallNotificationManager.notificationId(activeCallId) + 100000);
        }
        super.onDestroy();
    }

    private Notification buildNotification(String displayName, String callType) {
        Intent openIntent = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(this, 0, openIntent, pendingFlags());
        Intent endIntent = new Intent(this, CallActionReceiver.class).setAction(CallNotificationManager.ACTION_END).putExtra(CallNotificationManager.EXTRA_CALL_ID, activeCallId);
        PendingIntent end = PendingIntent.getBroadcast(this, 1, endIntent, pendingFlags());
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CallNotificationManager.CHANNEL_ACTIVE)
            : new Notification.Builder(this);
        return builder.setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(displayName == null ? "Auto-AI call" : displayName)
            .setContentText("Active " + ("audio".equals(callType) ? "audio" : "video") + " call")
            .setContentIntent(open)
            .setCategory(Notification.CATEGORY_CALL)
            .setOngoing(true)
            .setUsesChronometer(true)
            .setWhen(System.currentTimeMillis())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Hang up", end).build())
            .build();
    }

    private int pendingFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }
}
