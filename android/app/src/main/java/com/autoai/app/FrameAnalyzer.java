package com.autoai.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicBoolean;

public class FrameAnalyzer implements ImageAnalysis.Analyzer {
    public interface FrameListener {
        void onFrame(FrameData frame);
        void onFrameError(String message);
    }

    public interface FreshFrameCallback {
        void onFrame(FrameData frame);
        void onError(String message);
    }

    public static class FrameData {
        public final String base64;
        public final long timestamp;
        public final boolean sceneChanged;
        public final int width;
        public final int height;

        FrameData(String base64, long timestamp, boolean sceneChanged, int width, int height) {
            this.base64 = base64;
            this.timestamp = timestamp;
            this.sceneChanged = sceneChanged;
            this.width = width;
            this.height = height;
        }
    }

    private static final double SCENE_CHANGE_THRESHOLD = 7.5;
    private final FrameListener listener;
    private final AtomicBoolean processing = new AtomicBoolean(false);
    private volatile long intervalMs;
    private volatile int maxLongEdge;
    private volatile int jpegQuality;
    private volatile long lastSampleAt;
    private volatile long lastInspectionAt;
    private volatile FreshFrameCallback freshFrameCallback;
    private double[] previousLuma;

    public FrameAnalyzer(FrameListener listener, long intervalMs, int maxLongEdge, int jpegQuality) {
        this.listener = listener;
        configure(intervalMs, maxLongEdge, jpegQuality);
    }

    public void configure(long intervalMs, int maxLongEdge, int jpegQuality) {
        this.intervalMs = Math.max(750, Math.min(3000, intervalMs));
        this.maxLongEdge = Math.max(320, Math.min(1024, maxLongEdge));
        this.jpegQuality = Math.max(55, Math.min(80, jpegQuality));
    }

    public void requestFreshFrame(FreshFrameCallback callback) {
        freshFrameCallback = callback;
    }

    @Override
    public void analyze(@NonNull ImageProxy image) {
        FreshFrameCallback requested = freshFrameCallback;
        long now = System.currentTimeMillis();
        boolean forced = requested != null;
        if (!forced && now - lastInspectionAt < 350) {
            image.close();
            return;
        }
        if (!processing.compareAndSet(false, true)) {
            image.close();
            return;
        }
        try {
            lastInspectionAt = now;
            double[] currentLuma = sampleLuma(image);
            boolean sceneChanged = previousLuma == null || lumaDifference(previousLuma, currentLuma) >= SCENE_CHANGE_THRESHOLD;
            if (!forced && (!sceneChanged || now - lastSampleAt < intervalMs)) {
                return;
            }
            byte[] jpeg = imageToJpeg(image, maxLongEdge, jpegQuality);
            FrameData frame = new FrameData(
                Base64.encodeToString(jpeg, Base64.NO_WRAP),
                now,
                sceneChanged,
                image.getWidth(),
                image.getHeight()
            );
            previousLuma = currentLuma;
            lastSampleAt = now;
            if (requested != null && requested == freshFrameCallback) {
                freshFrameCallback = null;
                requested.onFrame(frame);
            }
            listener.onFrame(frame);
        } catch (Exception error) {
            String message = error.getMessage() == null ? "Camera frame conversion failed." : error.getMessage();
            if (requested != null && requested == freshFrameCallback) {
                freshFrameCallback = null;
                requested.onError(message);
            }
            listener.onFrameError(message);
        } finally {
            processing.set(false);
            image.close();
        }
    }

    private byte[] imageToJpeg(ImageProxy image, int maximumEdge, int quality) {
        byte[] nv21 = yuv420ToNv21(image);
        YuvImage yuv = new YuvImage(nv21, ImageFormat.NV21, image.getWidth(), image.getHeight(), null);
        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        if (!yuv.compressToJpeg(new Rect(0, 0, image.getWidth(), image.getHeight()), quality, raw)) {
            throw new IllegalStateException("Camera frame compression failed.");
        }
        Bitmap bitmap = BitmapFactory.decodeByteArray(raw.toByteArray(), 0, raw.size());
        if (bitmap == null) throw new IllegalStateException("Camera frame decoding failed.");
        int rotation = image.getImageInfo().getRotationDegrees();
        Matrix matrix = new Matrix();
        if (rotation != 0) matrix.postRotate(rotation);
        Bitmap rotated = rotation == 0
            ? bitmap
            : Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        if (rotated != bitmap) bitmap.recycle();
        int width = rotated.getWidth();
        int height = rotated.getHeight();
        Bitmap output = rotated;
        int longEdge = Math.max(width, height);
        if (longEdge > maximumEdge) {
            float scale = maximumEdge / (float) longEdge;
            output = Bitmap.createScaledBitmap(rotated, Math.round(width * scale), Math.round(height * scale), true);
            rotated.recycle();
        }
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        output.compress(Bitmap.CompressFormat.JPEG, quality, compressed);
        output.recycle();
        return compressed.toByteArray();
    }

    private byte[] yuv420ToNv21(ImageProxy image) {
        int width = image.getWidth();
        int height = image.getHeight();
        byte[] output = new byte[width * height * 3 / 2];
        ImageProxy.PlaneProxy[] planes = image.getPlanes();
        copyPlane(planes[0], width, height, output, 0, 1);
        ByteBuffer u = planes[1].getBuffer().duplicate();
        ByteBuffer v = planes[2].getBuffer().duplicate();
        int uBase = u.position();
        int vBase = v.position();
        int position = width * height;
        for (int row = 0; row < height / 2; row++) {
            int uRow = uBase + row * planes[1].getRowStride();
            int vRow = vBase + row * planes[2].getRowStride();
            for (int column = 0; column < width / 2; column++) {
                output[position++] = v.get(vRow + column * planes[2].getPixelStride());
                output[position++] = u.get(uRow + column * planes[1].getPixelStride());
            }
        }
        return output;
    }

    private void copyPlane(ImageProxy.PlaneProxy plane, int width, int height, byte[] output, int offset, int outputStride) {
        ByteBuffer buffer = plane.getBuffer().duplicate();
        int base = buffer.position();
        int outputPosition = offset;
        for (int row = 0; row < height; row++) {
            int rowStart = base + row * plane.getRowStride();
            for (int column = 0; column < width; column++) {
                output[outputPosition] = buffer.get(rowStart + column * plane.getPixelStride());
                outputPosition += outputStride;
            }
        }
    }

    private double[] sampleLuma(ImageProxy image) {
        int sampleWidth = 16;
        int sampleHeight = 16;
        double[] values = new double[sampleWidth * sampleHeight];
        ImageProxy.PlaneProxy plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer().duplicate();
        int base = buffer.position();
        for (int y = 0; y < sampleHeight; y++) {
            int sourceY = Math.min(image.getHeight() - 1, y * image.getHeight() / sampleHeight);
            for (int x = 0; x < sampleWidth; x++) {
                int sourceX = Math.min(image.getWidth() - 1, x * image.getWidth() / sampleWidth);
                int index = base + sourceY * plane.getRowStride() + sourceX * plane.getPixelStride();
                values[y * sampleWidth + x] = buffer.get(index) & 0xff;
            }
        }
        return values;
    }

    private double lumaDifference(double[] previous, double[] current) {
        double total = 0;
        for (int index = 0; index < current.length; index++) {
            total += Math.abs(previous[index] - current[index]);
        }
        return total / current.length;
    }
}
