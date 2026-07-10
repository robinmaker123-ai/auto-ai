package com.autoai.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.provider.Settings;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.camera.view.PreviewView;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "LiveVision",
    permissions = @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
)
public class LiveVisionPlugin extends Plugin implements FrameAnalyzer.FrameListener {
    private static final String PREFS = "auto_ai_live_permissions";
    private static final String CAMERA_REQUESTED = "camera_requested";
    private PreviewView previewView;
    private CameraXSessionManager sessionManager;
    private PluginCall pendingFreshFrameCall;

    @PluginMethod
    public void checkCameraPermission(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void requestCameraPermission(PluginCall call) {
        PermissionState state = getPermissionState("camera");
        if (state == PermissionState.GRANTED || state == PermissionState.DENIED) {
            call.resolve(permissionResult());
            return;
        }
        getContext().getSharedPreferences(PREFS, 0).edit().putBoolean(CAMERA_REQUESTED, true).apply();
        requestPermissionForAlias("camera", call, "cameraPermissionCallback");
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
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
    public void startCamera(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED
            || getContext().checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Camera permission is required.", "CAMERA_PERMISSION_REQUIRED");
            return;
        }
        boolean frontFacing = "user".equals(call.getString("facing", "environment"));
        long intervalMs = call.getLong("intervalMs", 1500L);
        int maxLongEdge = call.getInt("maxLongEdge", 768);
        int quality = call.getInt("jpegQuality", 70);
        getActivity().runOnUiThread(() -> {
            ensureSessionManager(intervalMs, maxLongEdge, quality);
            sessionManager.configure(intervalMs, maxLongEdge, quality);
            sessionManager.start(frontFacing, new CameraXSessionManager.StateListener() {
                @Override
                public void onReady() {
                    JSObject result = new JSObject();
                    result.put("facing", sessionManager.isFrontFacing() ? "user" : "environment");
                    call.resolve(result);
                }

                @Override
                public void onError(String message) {
                    removePreview();
                    call.reject(message, "CAMERA_START_FAILED");
                }
            });
        });
    }

    @PluginMethod
    public void switchCamera(PluginCall call) {
        if (sessionManager == null || !sessionManager.isStarted()) {
            call.reject("Camera is not running.", "CAMERA_NOT_RUNNING");
            return;
        }
        sessionManager.switchCamera(new CameraXSessionManager.StateListener() {
            @Override
            public void onReady() {
                JSObject result = new JSObject();
                result.put("facing", sessionManager.isFrontFacing() ? "user" : "environment");
                call.resolve(result);
            }

            @Override
            public void onError(String message) {
                call.reject(message, "CAMERA_SWITCH_FAILED");
            }
        });
    }

    @PluginMethod
    public void captureFreshFrame(PluginCall call) {
        if (sessionManager == null || !sessionManager.isStarted()) {
            call.reject("Camera is not running.", "CAMERA_NOT_RUNNING");
            return;
        }
        if (pendingFreshFrameCall != null) {
            pendingFreshFrameCall.reject("A newer frame request replaced this one.", "FRAME_REPLACED");
        }
        pendingFreshFrameCall = call;
        sessionManager.requestFreshFrame(new FrameAnalyzer.FreshFrameCallback() {
            @Override
            public void onFrame(FrameAnalyzer.FrameData frame) {
                PluginCall pending = pendingFreshFrameCall;
                pendingFreshFrameCall = null;
                if (pending != null) pending.resolve(frameResult(frame));
            }

            @Override
            public void onError(String message) {
                PluginCall pending = pendingFreshFrameCall;
                pendingFreshFrameCall = null;
                if (pending != null) pending.reject(message, "FRAME_CAPTURE_FAILED");
            }
        });
    }

    @PluginMethod
    public void setSamplingInterval(PluginCall call) {
        if (sessionManager != null) {
            sessionManager.configure(
                call.getLong("intervalMs", 1500L),
                call.getInt("maxLongEdge", 768),
                call.getInt("jpegQuality", 70)
            );
        }
        call.resolve();
    }

    @PluginMethod
    public void stopCamera(PluginCall call) {
        stopCameraInternal();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        stopCameraInternal();
    }

    @Override
    protected void handleOnDestroy() {
        if (sessionManager != null) {
            sessionManager.destroy();
            sessionManager = null;
        }
        removePreview();
    }

    @Override
    public void onFrame(FrameAnalyzer.FrameData frame) {
        notifyListeners("frame", frameResult(frame));
    }

    @Override
    public void onFrameError(String message) {
        JSObject error = new JSObject();
        error.put("message", message);
        notifyListeners("visionError", error);
    }

    private void ensureSessionManager(long intervalMs, int maxLongEdge, int quality) {
        if (previewView == null) {
            previewView = new PreviewView(getActivity());
            previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
            previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
            FrameLayout root = getActivity().findViewById(android.R.id.content);
            root.addView(
                previewView,
                0,
                new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            );
            getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        }
        if (sessionManager == null) {
            FrameAnalyzer analyzer = new FrameAnalyzer(this, intervalMs, maxLongEdge, quality);
            sessionManager = new CameraXSessionManager(getActivity(), previewView, analyzer);
        }
    }

    private synchronized void stopCameraInternal() {
        if (sessionManager != null) sessionManager.stop();
        if (pendingFreshFrameCall != null) {
            pendingFreshFrameCall.reject("Camera stopped.", "CAMERA_STOPPED");
            pendingFreshFrameCall = null;
        }
        removePreview();
    }

    private void removePreview() {
        PreviewView current = previewView;
        previewView = null;
        if (current == null) return;
        getActivity().runOnUiThread(() -> {
            ViewGroup parent = (ViewGroup) current.getParent();
            if (parent != null) parent.removeView(current);
        });
        if (sessionManager != null) {
            sessionManager.destroy();
            sessionManager = null;
        }
    }

    private JSObject permissionResult() {
        PermissionState state = getPermissionState("camera");
        boolean requested = getContext().getSharedPreferences(PREFS, 0).getBoolean(CAMERA_REQUESTED, false);
        JSObject result = new JSObject();
        result.put("state", state == null ? "prompt" : state.toString());
        result.put("granted", state == PermissionState.GRANTED);
        result.put("permanentlyDenied", requested && state == PermissionState.DENIED);
        return result;
    }

    private JSObject frameResult(FrameAnalyzer.FrameData frame) {
        JSObject result = new JSObject();
        result.put("data", "data:image/jpeg;base64," + frame.base64);
        result.put("timestamp", frame.timestamp);
        result.put("sceneChanged", frame.sceneChanged);
        result.put("width", frame.width);
        result.put("height", frame.height);
        return result;
    }
}
