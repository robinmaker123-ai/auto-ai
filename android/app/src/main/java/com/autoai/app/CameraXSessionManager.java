package com.autoai.app;

import android.app.Activity;

import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.google.common.util.concurrent.ListenableFuture;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CameraXSessionManager {
    public interface StateListener {
        void onReady();
        void onError(String message);
    }

    private final Activity activity;
    private final PreviewView previewView;
    private final FrameAnalyzer analyzer;
    private final ExecutorService analysisExecutor = Executors.newSingleThreadExecutor();
    private ProcessCameraProvider cameraProvider;
    private boolean frontFacing;
    private boolean started;

    public CameraXSessionManager(Activity activity, PreviewView previewView, FrameAnalyzer analyzer) {
        this.activity = activity;
        this.previewView = previewView;
        this.analyzer = analyzer;
    }

    public void start(boolean useFrontCamera, StateListener listener) {
        frontFacing = useFrontCamera;
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(activity);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                bind();
                started = true;
                listener.onReady();
            } catch (Exception error) {
                started = false;
                listener.onError(error.getMessage() == null ? "Camera could not be started." : error.getMessage());
            }
        }, ContextCompat.getMainExecutor(activity));
    }

    public void switchCamera(StateListener listener) {
        start(!frontFacing, listener);
    }

    public void configure(long intervalMs, int maxLongEdge, int jpegQuality) {
        analyzer.configure(intervalMs, maxLongEdge, jpegQuality);
    }

    public void requestFreshFrame(FrameAnalyzer.FreshFrameCallback callback) {
        analyzer.requestFreshFrame(callback);
    }

    public boolean isFrontFacing() {
        return frontFacing;
    }

    public boolean isStarted() {
        return started;
    }

    public void stop() {
        started = false;
        if (cameraProvider != null) {
            cameraProvider.unbindAll();
            cameraProvider = null;
        }
    }

    public void destroy() {
        stop();
        analysisExecutor.shutdownNow();
    }

    private void bind() {
        if (!(activity instanceof LifecycleOwner)) {
            throw new IllegalStateException("Camera lifecycle is unavailable.");
        }
        cameraProvider.unbindAll();
        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());
        ImageAnalysis analysis = new ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build();
        analysis.setAnalyzer(analysisExecutor, analyzer);
        CameraSelector selector = frontFacing
            ? CameraSelector.DEFAULT_FRONT_CAMERA
            : CameraSelector.DEFAULT_BACK_CAMERA;
        cameraProvider.bindToLifecycle((LifecycleOwner) activity, selector, preview, analysis);
    }
}
