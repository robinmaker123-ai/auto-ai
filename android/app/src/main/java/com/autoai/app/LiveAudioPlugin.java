package com.autoai.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(
    name = "LiveAudio",
    permissions = @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
)
public class LiveAudioPlugin extends Plugin {
    private static final int SAMPLE_RATE = 16000;
    private static final int SILENCE_MS = 900;
    private static final double SPEECH_RMS_THRESHOLD = 650.0;
    private static final String PREFS = "auto_ai_live_permissions";
    private static final String MIC_REQUESTED = "microphone_requested";

    private final AtomicBoolean capturing = new AtomicBoolean(false);
    private AudioRecord recorder;
    private Thread captureThread;
    private AcousticEchoCanceler echoCanceler;
    private NoiseSuppressor noiseSuppressor;
    private volatile boolean speechActive;
    private volatile long lastSpeechAt;

    @PluginMethod
    public void checkMicrophonePermission(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void requestMicrophonePermission(PluginCall call) {
        PermissionState state = getPermissionState("microphone");
        if (state == PermissionState.GRANTED || state == PermissionState.DENIED) {
            call.resolve(permissionResult());
            return;
        }
        getContext().getSharedPreferences(PREFS, 0).edit().putBoolean(MIC_REQUESTED, true).apply();
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void startCapture(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED
            || getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Microphone permission is required.", "MICROPHONE_PERMISSION_REQUIRED");
            return;
        }
        if (capturing.get()) {
            call.resolve();
            return;
        }
        int minimum = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        if (minimum <= 0) {
            call.reject("Unable to allocate microphone buffer.", "AUDIO_INITIALIZATION_FAILED");
            return;
        }
        try {
            recorder = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(minimum * 2, SAMPLE_RATE)
            );
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                releaseRecorder();
                call.reject("Microphone could not be initialized.", "AUDIO_INITIALIZATION_FAILED");
                return;
            }
            enableAudioEffects(recorder.getAudioSessionId());
            recorder.startRecording();
            capturing.set(true);
            speechActive = false;
            captureThread = new Thread(this::captureLoop, "auto-ai-live-audio");
            captureThread.start();
            call.resolve();
        } catch (SecurityException error) {
            releaseRecorder();
            call.reject("Microphone permission was revoked.", "MICROPHONE_PERMISSION_REQUIRED", error);
        } catch (RuntimeException error) {
            releaseRecorder();
            call.reject("Microphone capture failed.", "AUDIO_INITIALIZATION_FAILED", error);
        }
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        stopCaptureInternal();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        stopCaptureInternal();
    }

    @Override
    protected void handleOnDestroy() {
        stopCaptureInternal();
    }

    private void captureLoop() {
        byte[] buffer = new byte[3200];
        while (capturing.get()) {
            AudioRecord activeRecorder = recorder;
            if (activeRecorder == null) break;
            int read;
            try {
                read = activeRecorder.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING);
            } catch (RuntimeException error) {
                notifyAudioError("Microphone capture stopped unexpectedly.");
                break;
            }
            if (read <= 0) continue;
            long now = System.currentTimeMillis();
            boolean speech = calculateRms(buffer, read) >= SPEECH_RMS_THRESHOLD;
            if (speech) {
                lastSpeechAt = now;
                if (!speechActive) {
                    speechActive = true;
                    notifyListeners("speechStart", new JSObject());
                }
            }
            if (speechActive) {
                JSObject chunk = new JSObject();
                chunk.put("data", Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP));
                chunk.put("format", "pcm16");
                chunk.put("sampleRate", SAMPLE_RATE);
                notifyListeners("audioChunk", chunk);
                if (!speech && now - lastSpeechAt >= SILENCE_MS) {
                    speechActive = false;
                    JSObject end = new JSObject();
                    end.put("format", "pcm16");
                    notifyListeners("speechEnd", end);
                }
            }
        }
        if (speechActive) {
            speechActive = false;
            JSObject end = new JSObject();
            end.put("format", "pcm16");
            notifyListeners("speechEnd", end);
        }
        capturing.set(false);
    }

    private double calculateRms(byte[] data, int length) {
        if (length < 2) return 0;
        double total = 0;
        int samples = length / 2;
        for (int index = 0; index + 1 < length; index += 2) {
            short sample = (short) ((data[index] & 0xff) | (data[index + 1] << 8));
            total += (double) sample * sample;
        }
        return Math.sqrt(total / samples);
    }

    private void enableAudioEffects(int sessionId) {
        if (AcousticEchoCanceler.isAvailable()) {
            echoCanceler = AcousticEchoCanceler.create(sessionId);
            if (echoCanceler != null) echoCanceler.setEnabled(true);
        }
        if (NoiseSuppressor.isAvailable()) {
            noiseSuppressor = NoiseSuppressor.create(sessionId);
            if (noiseSuppressor != null) noiseSuppressor.setEnabled(true);
        }
    }

    private synchronized void stopCaptureInternal() {
        capturing.set(false);
        AudioRecord activeRecorder = recorder;
        if (activeRecorder != null) {
            try {
                activeRecorder.stop();
            } catch (IllegalStateException ignored) {
            }
        }
        Thread activeThread = captureThread;
        if (activeThread != null && activeThread != Thread.currentThread()) {
            try {
                activeThread.join(800);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }
        captureThread = null;
        releaseRecorder();
    }

    private void releaseRecorder() {
        if (echoCanceler != null) {
            echoCanceler.release();
            echoCanceler = null;
        }
        if (noiseSuppressor != null) {
            noiseSuppressor.release();
            noiseSuppressor = null;
        }
        if (recorder != null) {
            recorder.release();
            recorder = null;
        }
    }

    private JSObject permissionResult() {
        PermissionState state = getPermissionState("microphone");
        boolean requested = getContext().getSharedPreferences(PREFS, 0).getBoolean(MIC_REQUESTED, false);
        JSObject result = new JSObject();
        result.put("state", state == null ? "prompt" : state.toString());
        result.put("granted", state == PermissionState.GRANTED);
        result.put("permanentlyDenied", requested && state == PermissionState.DENIED);
        return result;
    }

    private void notifyAudioError(String message) {
        JSObject error = new JSObject();
        error.put("message", message);
        notifyListeners("audioError", error);
    }
}
