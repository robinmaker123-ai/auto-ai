import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PermissionResult } from "../live/LiveAudioAdapter";

type Facing = "user" | "environment";
export type VisionStatus = "Camera on" | "Looking" | "Scene updated" | "Analyzing" | "Vision paused";

type NativeFrame = {
  data: string;
  timestamp: number;
  sceneChanged: boolean;
  width: number;
  height: number;
};

interface NativeVisionPlugin {
  checkCameraPermission(): Promise<PermissionResult>;
  requestCameraPermission(): Promise<PermissionResult>;
  openAppSettings(): Promise<void>;
  startCamera(options: { facing: Facing; intervalMs: number; maxLongEdge: number; jpegQuality: number }): Promise<{ facing: Facing }>;
  switchCamera(): Promise<{ facing: Facing }>;
  captureFreshFrame(): Promise<NativeFrame>;
  setSamplingInterval(options: { intervalMs: number; maxLongEdge: number; jpegQuality: number }): Promise<void>;
  stopCamera(): Promise<void>;
  addListener(eventName: "frame", listener: (frame: NativeFrame) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "visionError", listener: (error: { message: string }) => void): Promise<PluginListenerHandle>;
}

const NativeVision = registerPlugin<NativeVisionPlugin>("LiveVision");

export function useLiveVision(onFrame: (data: string, timestamp: number) => void) {
  const native = Capacitor.getPlatform() === "android";
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<Facing>("environment");
  const [cameraError, setCameraError] = useState("");
  const [cameraPermission, setCameraPermission] = useState<PermissionResult | null>(null);
  const [visionStatus, setVisionStatus] = useState<VisionStatus>("Vision paused");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [previewFrame, setPreviewFrame] = useState("");
  const frameHandlerRef = useRef(onFrame);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<PluginListenerHandle[]>([]);
  const previousLumaRef = useRef<number[] | null>(null);
  const desiredActiveRef = useRef(false);
  const facingRef = useRef<Facing>("environment");
  const pausedRef = useRef(false);
  frameHandlerRef.current = onFrame;

  const setVideoElement = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (element && streamRef.current) {
      element.srcObject = streamRef.current;
      void element.play().catch(() => undefined);
    }
  }, []);

  const checkPermission = useCallback(async () => {
    if (native) {
      const result = await NativeVision.checkCameraPermission();
      setCameraPermission(result);
      return result;
    }
    try {
      const permission = await navigator.permissions.query({ name: "camera" as PermissionName });
      const result: PermissionResult = {
        state: permission.state === "granted" ? "granted" : permission.state === "denied" ? "denied" : "prompt",
        granted: permission.state === "granted",
        permanentlyDenied: permission.state === "denied",
      };
      setCameraPermission(result);
      return result;
    } catch {
      const result: PermissionResult = { state: "prompt", granted: false, permanentlyDenied: false };
      setCameraPermission(result);
      return result;
    }
  }, [native]);

  const requestPermission = useCallback(async () => {
    if (native) {
      const result = await NativeVision.requestCameraPermission();
      setCameraPermission(result);
      return result;
    }
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingRef.current }, audio: false });
      probe.getTracks().forEach((track) => track.stop());
      const result: PermissionResult = { state: "granted", granted: true, permanentlyDenied: false };
      setCameraPermission(result);
      return result;
    } catch {
      const result: PermissionResult = { state: "denied", granted: false, permanentlyDenied: true };
      setCameraPermission(result);
      return result;
    }
  }, [native]);

  const removeNativeListeners = useCallback(async () => {
    const listeners = listenersRef.current;
    listenersRef.current = [];
    await Promise.all(listeners.map((listener) => listener.remove().catch(() => undefined)));
  }, []);

  const scheduleWebFrame = useCallback((delay = 1500) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!desiredActiveRef.current || pausedRef.current || native) return;
    timerRef.current = setTimeout(async () => {
      setVisionStatus("Looking");
      const frame = await captureWebFrame(videoRef.current, previousLumaRef, false);
      if (frame) {
        setVisionStatus("Analyzing");
        frameHandlerRef.current(frame, Date.now());
      } else {
        setVisionStatus("Camera on");
      }
      const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
      scheduleWebFrame(connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g" ? 2750 : 1500);
    }, delay);
  }, [native]);

  const startCamera = useCallback(async (facing: Facing = facingRef.current) => {
    setCameraError("");
    const currentPermission = await checkPermission();
    const permission = currentPermission.granted ? currentPermission : await requestPermission();
    if (!permission.granted) {
      setCameraError("Camera access is required when camera is enabled.");
      throw new Error("Camera permission denied");
    }
    desiredActiveRef.current = true;
    pausedRef.current = false;
    facingRef.current = facing;
    if (native) {
      await removeNativeListeners();
      listenersRef.current = await Promise.all([
        NativeVision.addListener("frame", (frame) => {
          setPreviewFrame(frame.data);
          setVisionStatus("Analyzing");
          frameHandlerRef.current(frame.data, frame.timestamp);
        }),
        NativeVision.addListener("visionError", (error) => setCameraError(error.message)),
      ]);
      const result = await NativeVision.startCamera({ facing, intervalMs: adaptiveInterval(), maxLongEdge: 768, jpegQuality: 70 });
      setCameraFacing(result.facing);
    } else {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = media;
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play().catch(() => undefined);
      }
      scheduleWebFrame(250);
    }
    setCameraFacing(facing);
    setCameraActive(true);
    setVisionStatus("Camera on");
  }, [checkPermission, native, removeNativeListeners, requestPermission, scheduleWebFrame]);

  const stopCamera = useCallback(async (preserveIntent = false) => {
    if (!preserveIntent) desiredActiveRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (native) {
      await NativeVision.stopCamera().catch(() => undefined);
      await removeNativeListeners();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    previousLumaRef.current = null;
    setPreviewFrame("");
    setCameraActive(false);
    setVisionStatus("Vision paused");
  }, [native, removeNativeListeners]);

  const switchCamera = useCallback(async () => {
    if (!cameraActive) return;
    if (native) {
      const result = await NativeVision.switchCamera();
      facingRef.current = result.facing;
      setCameraFacing(result.facing);
      return;
    }
    const next = facingRef.current === "user" ? "environment" : "user";
    await startCamera(next);
  }, [cameraActive, native, startCamera]);

  const captureFreshFrame = useCallback(async () => {
    if (!cameraActive) return null;
    setVisionStatus("Looking");
    if (native) {
      const frame = await NativeVision.captureFreshFrame();
      setPreviewFrame(frame.data);
      setVisionStatus("Analyzing");
      return frame.data;
    }
    const frame = await captureWebFrame(videoRef.current, previousLumaRef, true);
    if (frame) {
      frameHandlerRef.current(frame, Date.now());
      setVisionStatus("Analyzing");
    }
    return frame;
  }, [cameraActive, native]);

  const markSceneUpdated = useCallback(() => setVisionStatus("Scene updated"), []);
  const markAnalyzing = useCallback(() => setVisionStatus("Analyzing"), []);
  const openAppSettings = useCallback(async () => {
    if (native) await NativeVision.openAppSettings();
    else setCameraError("Open this browser's site settings and allow camera access.");
  }, [native]);

  const pause = useCallback(async () => {
    pausedRef.current = true;
    if (desiredActiveRef.current) await stopCamera(true);
  }, [stopCamera]);

  const resume = useCallback(async () => {
    if (!desiredActiveRef.current) return;
    pausedRef.current = false;
    const permission = await checkPermission();
    if (permission.granted) await startCamera(facingRef.current);
    else setCameraError("Camera permission was revoked.");
  }, [checkPermission, startCamera]);

  useEffect(() => () => { void stopCamera(); }, [stopCamera]);

  useEffect(() => {
    if (!native || !cameraActive) return;
    const connection = (navigator as Navigator & { connection?: EventTarget & { effectiveType?: string } }).connection;
    if (!connection) return;
    const updateInterval = () => {
      void NativeVision.setSamplingInterval({ intervalMs: adaptiveInterval(), maxLongEdge: 768, jpegQuality: 70 });
    };
    connection.addEventListener("change", updateInterval);
    return () => connection.removeEventListener("change", updateInterval);
  }, [cameraActive, native]);

  return {
    native,
    cameraActive,
    cameraFacing,
    cameraError,
    cameraPermission,
    visionStatus,
    stream,
    previewFrame,
    setVideoElement,
    startCamera,
    stopCamera,
    switchCamera,
    captureFreshFrame,
    checkPermission,
    openAppSettings,
    markSceneUpdated,
    markAnalyzing,
    pause,
    resume,
    setCameraError,
  };
}

async function captureWebFrame(
  video: HTMLVideoElement | null,
  previousLumaRef: { current: number[] | null },
  force: boolean,
) {
  if (!video?.videoWidth || !video.videoHeight) return null;
  const longEdge = Math.max(video.videoWidth, video.videoHeight);
  const scale = Math.min(1, 768 / longEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const luma = sampleCanvasLuma(context, canvas.width, canvas.height);
  const changed = !previousLumaRef.current || sceneDifference(previousLumaRef.current, luma) >= 7.5;
  if (!force && !changed) return null;
  previousLumaRef.current = luma;
  return canvas.toDataURL("image/jpeg", 0.7);
}

function sampleCanvasLuma(context: CanvasRenderingContext2D, width: number, height: number) {
  const sample = document.createElement("canvas");
  sample.width = 16;
  sample.height = 16;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return [];
  sampleContext.drawImage(context.canvas, 0, 0, width, height, 0, 0, 16, 16);
  const data = sampleContext.getImageData(0, 0, 16, 16).data;
  const values: number[] = [];
  for (let index = 0; index < data.length; index += 4) {
    values.push(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
  }
  return values;
}

function sceneDifference(previous: number[], current: number[]) {
  if (!previous.length || previous.length !== current.length) return Number.POSITIVE_INFINITY;
  return current.reduce((total, value, index) => total + Math.abs(value - previous[index]), 0) / current.length;
}

function adaptiveInterval() {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g" ? 2750 : 1500;
}
