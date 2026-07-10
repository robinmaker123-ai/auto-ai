import { Capacitor, registerPlugin } from "@capacitor/core";
import { useCallback, useEffect, useRef } from "react";
import { createLiveAudioAdapter, type LiveAudioCallbacks, type PermissionResult } from "../live/LiveAudioAdapter";

interface NativeSpeechPlugin {
  speak(options: { text: string; language: string; rate: number; volume: number }): Promise<void>;
  stopSpeaking(): Promise<void>;
  release(): Promise<void>;
}

const NativeSpeech = registerPlugin<NativeSpeechPlugin>("AutoAiLiveSpeech");

export function useLiveAudio(callbacks: LiveAudioCallbacks) {
  const adapterRef = useRef(createLiveAudioAdapter());
  const callbacksRef = useRef(callbacks);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  callbacksRef.current = callbacks;

  const checkPermission = useCallback(() => adapterRef.current.checkPermission(), []);
  const requestPermission = useCallback(() => adapterRef.current.requestPermission(), []);
  const openAppSettings = useCallback(() => adapterRef.current.openAppSettings(), []);

  const startListening = useCallback(async () => {
    const permission = await adapterRef.current.checkPermission();
    if (!permission.granted) throw permissionError(permission);
    await adapterRef.current.start({
      onSpeechStart: () => callbacksRef.current.onSpeechStart(),
      onAudioChunk: (data, format) => callbacksRef.current.onAudioChunk(data, format),
      onSpeechEnd: (format) => callbacksRef.current.onSpeechEnd(format),
      onPartial: (text) => callbacksRef.current.onPartial(text),
      onError: (message) => callbacksRef.current.onError(message),
    });
  }, []);

  const stopListening = useCallback(() => adapterRef.current.stop(), []);

  const stopSpeaking = useCallback(async () => {
    if (Capacitor.getPlatform() === "android") {
      await NativeSpeech.stopSpeaking().catch(() => undefined);
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
  }, []);

  const speak = useCallback(async (
    text: string,
    options: { language: string; rate: number; volume: number; voiceURI: string },
  ) => {
    await stopSpeaking();
    if (!text.trim()) return;
    if (Capacitor.getPlatform() === "android") {
      await NativeSpeech.speak({
        text,
        language: languageCode(options.language),
        rate: options.rate,
        volume: options.volume,
      });
      return;
    }
    if (!("speechSynthesis" in window)) throw new Error("Text-to-speech is unavailable.");
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = languageCode(options.language);
      utterance.rate = options.rate;
      utterance.volume = options.volume;
      if (options.voiceURI) {
        utterance.voice = window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === options.voiceURI) ?? null;
      }
      utterance.onend = () => {
        utteranceRef.current = null;
        resolve();
      };
      utterance.onerror = (event) => {
        utteranceRef.current = null;
        reject(new Error(event.error || "Text-to-speech failed."));
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }, [stopSpeaking]);

  const releaseSpeech = useCallback(async () => {
    await stopSpeaking();
    if (Capacitor.getPlatform() === "android") await NativeSpeech.release().catch(() => undefined);
  }, [stopSpeaking]);

  useEffect(() => () => {
    void adapterRef.current.stop();
    void releaseSpeech();
  }, [releaseSpeech]);

  return {
    isNative: adapterRef.current.native,
    checkPermission,
    requestPermission,
    openAppSettings,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    releaseSpeech,
  };
}

function permissionError(permission: PermissionResult) {
  const error = new Error("Microphone access is required for Live Mode.");
  Object.assign(error, { permission });
  return error;
}

function languageCode(language: string) {
  return language === "english" ? "en-IN" : "hi-IN";
}
