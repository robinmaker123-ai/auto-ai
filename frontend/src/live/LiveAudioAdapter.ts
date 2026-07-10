import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type PermissionResult = {
  state: "granted" | "denied" | "prompt" | "prompt-with-rationale";
  granted: boolean;
  permanentlyDenied: boolean;
};

export type LiveAudioCallbacks = {
  onSpeechStart: () => void;
  onAudioChunk: (data: string, format: string) => void;
  onSpeechEnd: (format: string) => void;
  onPartial: (text: string) => void;
  onError: (message: string) => void;
};

export interface LiveAudioAdapter {
  readonly native: boolean;
  checkPermission(): Promise<PermissionResult>;
  requestPermission(): Promise<PermissionResult>;
  openAppSettings(): Promise<void>;
  start(callbacks: LiveAudioCallbacks): Promise<void>;
  stop(): Promise<void>;
}

interface NativeLiveAudioPlugin {
  checkMicrophonePermission(): Promise<PermissionResult>;
  requestMicrophonePermission(): Promise<PermissionResult>;
  openAppSettings(): Promise<void>;
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  addListener(eventName: "speechStart", listener: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: "audioChunk", listener: (event: { data: string; format: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "speechEnd", listener: (event: { format: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "audioError", listener: (event: { message: string }) => void): Promise<PluginListenerHandle>;
}

const NativeLiveAudio = registerPlugin<NativeLiveAudioPlugin>("LiveAudio");

export class AndroidLiveAudioAdapter implements LiveAudioAdapter {
  readonly native = true;
  private listeners: PluginListenerHandle[] = [];

  checkPermission() {
    return NativeLiveAudio.checkMicrophonePermission();
  }

  requestPermission() {
    return NativeLiveAudio.requestMicrophonePermission();
  }

  async openAppSettings() {
    await NativeLiveAudio.openAppSettings();
  }

  async start(callbacks: LiveAudioCallbacks) {
    await this.stop();
    this.listeners = await Promise.all([
      NativeLiveAudio.addListener("speechStart", callbacks.onSpeechStart),
      NativeLiveAudio.addListener("audioChunk", (event) => callbacks.onAudioChunk(event.data, event.format)),
      NativeLiveAudio.addListener("speechEnd", (event) => callbacks.onSpeechEnd(event.format)),
      NativeLiveAudio.addListener("audioError", (event) => callbacks.onError(event.message)),
    ]);
    try {
      await NativeLiveAudio.startCapture();
    } catch (error) {
      await this.removeListeners();
      throw error;
    }
  }

  async stop() {
    await NativeLiveAudio.stopCapture().catch(() => undefined);
    await this.removeListeners();
  }

  private async removeListeners() {
    const listeners = this.listeners;
    this.listeners = [];
    await Promise.all(listeners.map((listener) => listener.remove().catch(() => undefined)));
  }
}

export class WebLiveAudioAdapter implements LiveAudioAdapter {
  readonly native = false;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private animationFrame = 0;
  private speechActive = false;
  private lastSpeechAt = 0;
  private callbacks: LiveAudioCallbacks | null = null;
  private chunkQueue: Promise<void> = Promise.resolve();
  private recognition: any = null;

  async checkPermission(): Promise<PermissionResult> {
    try {
      const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
      return {
        state: permission.state === "granted" ? "granted" : permission.state === "denied" ? "denied" : "prompt",
        granted: permission.state === "granted",
        permanentlyDenied: permission.state === "denied",
      };
    } catch {
      return { state: "prompt", granted: false, permanentlyDenied: false };
    }
  }

  async requestPermission(): Promise<PermissionResult> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints() });
      return { state: "granted", granted: true, permanentlyDenied: false };
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      return { state: "denied", granted: false, permanentlyDenied: name === "NotAllowedError" };
    }
  }

  async openAppSettings() {
    throw new Error("Open this browser's site settings and allow microphone access.");
  }

  async start(callbacks: LiveAudioCallbacks) {
    await this.stop();
    this.callbacks = callbacks;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints() });
    this.context = new AudioContext();
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.startOptionalPartialRecognition();
    this.monitorVoiceActivity();
  }

  async stop() {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.recorder = null;
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* already stopped */ }
    }
    this.recognition = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
    this.speechActive = false;
    this.callbacks = null;
  }

  private monitorVoiceActivity() {
    if (!this.analyser) return;
    const samples = new Uint8Array(this.analyser.fftSize);
    const tick = () => {
      if (!this.analyser || !this.callbacks) return;
      this.analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        energy += normalized * normalized;
      }
      const speaking = Math.sqrt(energy / samples.length) > 0.035;
      const now = performance.now();
      if (speaking) {
        this.lastSpeechAt = now;
        if (!this.speechActive) this.beginSpeechTurn();
      } else if (this.speechActive && now - this.lastSpeechAt >= 900) {
        this.endSpeechTurn();
      }
      this.animationFrame = requestAnimationFrame(tick);
    };
    this.animationFrame = requestAnimationFrame(tick);
  }

  private beginSpeechTurn() {
    if (!this.stream || this.recorder) return;
    this.speechActive = true;
    this.callbacks?.onSpeechStart();
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      .find((candidate) => MediaRecorder.isTypeSupported(candidate));
    try {
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    } catch (error) {
      this.callbacks?.onError(error instanceof Error ? error.message : "Audio recorder is unavailable.");
      this.speechActive = false;
      return;
    }
    const format = mimeType?.includes("ogg") ? "ogg" : "webm";
    this.chunkQueue = Promise.resolve();
    this.recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      this.chunkQueue = this.chunkQueue.then(async () => {
        const data = await blobToBase64(event.data);
        this.callbacks?.onAudioChunk(data, format);
      });
    };
    this.recorder.onstop = () => {
      this.chunkQueue.then(() => this.callbacks?.onSpeechEnd(format));
      this.recorder = null;
    };
    this.recorder.start(250);
  }

  private endSpeechTurn() {
    this.speechActive = false;
    if (this.recorder?.state === "recording") this.recorder.stop();
  }

  private startOptionalPartialRecognition() {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let partial = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (!event.results[index].isFinal) partial += event.results[index][0].transcript;
      }
      if (partial.trim()) this.callbacks?.onPartial(partial.trim());
    };
    recognition.onerror = (event: any) => {
      if (!["no-speech", "aborted"].includes(event.error)) this.callbacks?.onError("Main clearly nahi sun paya. Dobara boliye.");
    };
    recognition.onend = () => {
      if (this.callbacks && this.recognition === recognition) {
        try { recognition.start(); } catch { /* browser is already restarting */ }
      }
    };
    this.recognition = recognition;
    try { recognition.start(); } catch { this.recognition = null; }
  }

  private audioConstraints(): MediaTrackConstraints {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 16000,
    };
  }
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function createLiveAudioAdapter(): LiveAudioAdapter {
  return Capacitor.getPlatform() === "android" ? new AndroidLiveAudioAdapter() : new WebLiveAudioAdapter();
}
