import { useCallback, useEffect, useRef, useState } from "react";
import { useTranscript } from "./useTranscript";
import { useConnectionManager, type LiveServerEvent } from "./useConnectionManager";
import { useLiveAudio } from "./useLiveAudio";
import { useLiveVision } from "./useLiveVision";
import type { PermissionResult } from "../live/LiveAudioAdapter";
import type { LiveState } from "../live/liveStateMachine";
import { api } from "../api/client";

type VoiceOptions = {
  language: string;
  rate: number;
  volume: number;
  voiceURI: string;
};

type LiveSessionOptions = {
  token: string | null;
  provider?: string | null;
  model?: string | null;
  voice: VoiceOptions;
};

const VISUAL_QUESTION = /(?:ye+h?\s+kya|isme\s+kya|ise\s+dekho|camera\s+me(?:in)?|is\s+problem\s+ko\s+solve|ab\s+kya\s+karna|what(?:'s|\s+is)\s+this|look\s+at\s+this|explain\s+this\s+screen|what\s+should\s+i\s+do\s+here|what\s+do\s+you\s+see)/i;

export function useLiveSession({ token, provider, model, voice }: LiveSessionOptions) {
  const [state, setState] = useState<LiveState>("idle");
  const [sessionId, setSessionId] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState("");
  const [permission, setPermission] = useState<PermissionResult | null>(null);
  const [muted, setMuted] = useState(false);
  const [latestVisualSummary, setLatestVisualSummary] = useState("");
  const [latestFrameTimestamp, setLatestFrameTimestamp] = useState(0);
  const { lines, addLine, scrollRef } = useTranscript();

  const stateRef = useRef<LiveState>("idle");
  const sessionIdRef = useRef("");
  const endedRef = useRef(false);
  const backgroundRef = useRef(false);
  const mutedRef = useRef(false);
  const responseTextRef = useRef("");
  const lastUserTranscriptRef = useRef("");
  const audioRef = useRef<ReturnType<typeof useLiveAudio> | null>(null);
  const visionRef = useRef<ReturnType<typeof useLiveVision> | null>(null);
  const connectionRef = useRef<{ disconnect: (endSession: boolean) => void } | null>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const transition = useCallback((next: LiveState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const handleServerEvent = useCallback((event: LiveServerEvent) => {
    switch (event.type) {
      case "session.ready": {
        const id = typeof event.session_id === "string" ? event.session_id : "";
        sessionIdRef.current = id;
        setSessionId(id);
        setError("");
        if (event.configured === true) break;
        transition("connected");
        if (!mutedRef.current && !backgroundRef.current) {
          void audioRef.current?.startListening()
            .then(() => transition("listening"))
            .catch(() => {
              connectionRef.current?.disconnect(false);
              setPermission({ state: "denied", granted: false, permanentlyDenied: true });
              transition("permission_required");
            });
        }
        break;
      }
      case "transcript.partial":
        setInterimTranscript(String(event.text || ""));
        break;
      case "transcript.final": {
        const text = String(event.text || "").trim();
        setInterimTranscript("");
        if (text && text !== lastUserTranscriptRef.current) {
          lastUserTranscriptRef.current = text;
          addLine("user", text);
        }
        transition("thinking");
        break;
      }
      case "vision.processing":
        visionRef.current?.markAnalyzing();
        if (event.request_fresh_frame === true) void visionRef.current?.captureFreshFrame();
        break;
      case "vision.context":
        setLatestVisualSummary(String(event.summary || ""));
        if (typeof event.timestamp === "string") setLatestFrameTimestamp(Date.parse(event.timestamp));
        visionRef.current?.markSceneUpdated();
        break;
      case "assistant.thinking":
        responseTextRef.current = "";
        transition("thinking");
        break;
      case "assistant.text.delta":
        responseTextRef.current += String(event.delta || "");
        break;
      case "assistant.text.done": {
        const text = String(event.text || responseTextRef.current).trim();
        responseTextRef.current = text;
        if (text) addLine("assistant", text);
        if (!text || mutedRef.current || endedRef.current) {
          transition(mutedRef.current ? "connected" : "listening");
          break;
        }
        transition("speaking");
        void audioRef.current?.speak(text, voiceRef.current)
          .catch(() => setError("Voice playback failed. The response is shown as text."))
          .finally(() => {
            if (!endedRef.current && !backgroundRef.current) transition(mutedRef.current ? "connected" : "listening");
          });
        break;
      }
      case "assistant.done":
        if (event.interrupted === true && !endedRef.current) transition("listening");
        break;
      case "session.error": {
        const code = String(event.code || "");
        const message = String(event.message || "Live Mode encountered an error.");
        setError(message);
        if (["stt_failed", "stt_empty", "vision_failed", "turn_failed"].includes(code)) {
          if (!endedRef.current) transition(mutedRef.current ? "connected" : "listening");
        }
        break;
      }
    }
  }, [addLine, transition]);

  const connection = useConnectionManager(token, handleServerEvent);
  const {
    connectionState,
    lastHealthAt,
    connect,
    send,
    retry,
    disconnect,
    suspend,
    resume,
    updateCameraState,
    configure,
  } = connection;
  connectionRef.current = { disconnect };

  const vision = useLiveVision((data, timestamp) => {
    setLatestFrameTimestamp(timestamp);
    send("vision.frame", { data, timestamp, camera_on: true });
  });
  visionRef.current = vision;

  const audio = useLiveAudio({
    onSpeechStart: () => {
      setInterimTranscript("");
      if (stateRef.current === "speaking") {
        void audioRef.current?.stopSpeaking();
        send("assistant.interrupt");
      }
      transition("user_speaking");
    },
    onAudioChunk: (data, format) => {
      send("audio.chunk", { data, format });
    },
    onSpeechEnd: (format) => {
      send("audio.end", { format });
      transition("processing_speech");
    },
    onPartial: setInterimTranscript,
    onError: (message) => {
      setError(message || "Main clearly nahi sun paya. Dobara boliye.");
      if (!endedRef.current) transition("listening");
    },
  });
  audioRef.current = audio;
  const {
    checkPermission: checkMicrophonePermission,
    requestPermission: requestMicrophonePermission,
    openAppSettings: openMicrophoneSettings,
    startListening,
    stopListening,
    stopSpeaking,
    releaseSpeech,
  } = audio;
  const {
    cameraActive,
    cameraFacing,
    startCamera,
    stopCamera,
    captureFreshFrame,
    resume: resumeVision,
  } = vision;

  const connectAfterPermission = useCallback(() => {
    if (!token || endedRef.current) return;
    setError("");
    setPermission(null);
    transition("connecting");
    connect({
      session_id: sessionIdRef.current || undefined,
      language: voiceRef.current.language,
      provider,
      model,
      camera_on: visionRef.current?.cameraActive ?? false,
    });
  }, [connect, model, provider, token, transition]);

  const checkAndStart = useCallback(async (allowPrompt: boolean) => {
    if (!token || endedRef.current) return;
    transition("checking_microphone_permission");
    let result = await checkMicrophonePermission();
    if (!result.granted && allowPrompt && !result.permanentlyDenied) {
      transition("requesting_microphone_permission");
      result = await requestMicrophonePermission();
    }
    setPermission(result);
    if (!result.granted) {
      disconnect(false);
      setError("");
      transition("permission_required");
      return;
    }
    connectAfterPermission();
  }, [checkMicrophonePermission, connectAfterPermission, disconnect, requestMicrophonePermission, token, transition]);

  useEffect(() => {
    endedRef.current = false;
    void checkAndStart(true);
    return () => {
      endedRef.current = true;
      void audioRef.current?.stopListening();
      void audioRef.current?.stopSpeaking();
      void visionRef.current?.stopCamera();
      if (token && sessionIdRef.current) {
        void api.endLiveSession(token, sessionIdRef.current).catch(() => undefined);
      }
      disconnect(true);
    };
  }, [checkAndStart, disconnect, token]);

  useEffect(() => {
    if (permission && !permission.granted) return;
    if (connectionState === "connecting") transition("connecting");
    else if (["reconnecting", "offline", "error"].includes(connectionState)) {
      void stopListening();
      void stopSpeaking();
      transition(connectionState as "reconnecting" | "offline" | "error");
    }
  }, [connectionState, permission, stopListening, stopSpeaking, transition]);

  useEffect(() => {
    if (connectionState !== "connected") return;
    configure({ language: voice.language, provider, model });
  }, [configure, connectionState, model, provider, voice.language]);

  useEffect(() => {
    const visibilityChanged = async () => {
      if (document.visibilityState === "hidden") {
        backgroundRef.current = true;
        send("audio.cancel");
        await audioRef.current?.stopListening();
        await audioRef.current?.stopSpeaking();
        await visionRef.current?.pause();
        suspend();
        if (!endedRef.current) transition("idle");
        return;
      }
      if (!backgroundRef.current || endedRef.current) return;
      backgroundRef.current = false;
      const micPermission = await audioRef.current?.checkPermission();
      if (!micPermission?.granted) {
        setPermission(micPermission ?? { state: "denied", granted: false, permanentlyDenied: true });
        transition("permission_required");
        return;
      }
      await resumeVision();
      resume();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => document.removeEventListener("visibilitychange", visibilityChanged);
  }, [resume, resumeVision, send, suspend, transition]);

  const tryPermissionAgain = useCallback(() => checkAndStart(true), [checkAndStart]);
  const openAppSettings = useCallback(async () => {
    try {
      await openMicrophoneSettings();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Open app settings to allow microphone access.");
    }
  }, [openMicrophoneSettings]);

  const retryConnection = useCallback(() => {
    setError("");
    retry();
  }, [retry]);

  const toggleMute = useCallback(async () => {
    if (mutedRef.current) {
      const currentPermission = await checkMicrophonePermission();
      if (!currentPermission.granted) {
        setPermission(currentPermission);
        transition("permission_required");
        return;
      }
      mutedRef.current = false;
      setMuted(false);
      await startListening();
      transition("listening");
    } else {
      mutedRef.current = true;
      setMuted(true);
      send("audio.cancel");
      await stopListening();
      await stopSpeaking();
      transition("connected");
    }
  }, [checkMicrophonePermission, send, startListening, stopListening, stopSpeaking, transition]);

  const toggleCamera = useCallback(async () => {
    setError("");
    if (cameraActive) {
      await stopCamera();
      updateCameraState(false);
      return;
    }
    try {
      await startCamera(cameraFacing);
      updateCameraState(true);
    } catch {
      // useLiveVision exposes a compact camera permission error without changing network state.
    }
  }, [cameraActive, cameraFacing, startCamera, stopCamera, updateCameraState]);

  const sendText = useCallback(async (value: string) => {
    const text = value.trim();
    if (!text || connectionState !== "connected") return false;
    setError("");
    if (cameraActive && VISUAL_QUESTION.test(text) && Date.now() - latestFrameTimestamp > 1500) {
      await captureFreshFrame().catch(() => null);
    }
    lastUserTranscriptRef.current = text;
    addLine("user", text);
    send("transcript.final", { text });
    transition("thinking");
    return true;
  }, [addLine, cameraActive, captureFreshFrame, connectionState, latestFrameTimestamp, send, transition]);

  const manualAnalyze = useCallback(() => sendText("Camera me jo dikh raha hai use explain karo."), [sendText]);

  const endCall = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    transition("ended");
    setInterimTranscript("");
    await Promise.allSettled([
      stopListening(),
      releaseSpeech(),
      stopCamera(),
    ]);
    if (token && sessionIdRef.current) {
      await api.endLiveSession(token, sessionIdRef.current).catch(() => undefined);
    }
    disconnect(true);
  }, [disconnect, releaseSpeech, stopCamera, stopListening, token, transition]);

  const clearError = useCallback(() => setError(""), []);
  const connectionStrength = connectionState !== "connected"
    ? "none"
    : Date.now() - lastHealthAt < 30000 ? "strong" : "weak";

  return {
    state,
    sessionId,
    lines,
    scrollRef,
    interimTranscript,
    error,
    permission,
    muted,
    latestVisualSummary,
    latestFrameTimestamp,
    connectionStrength,
    vision,
    tryPermissionAgain,
    openAppSettings,
    retryConnection,
    toggleMute,
    toggleCamera,
    sendText,
    manualAnalyze,
    endCall,
    clearError,
  };
}
