import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Camera, CameraOff, Mic, MicOff, PhoneOff, RefreshCw, RotateCcw, ScanLine, Volume2, X } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../contexts/AuthContext";
import { useAppSettings } from "../../contexts/AppSettingsContext";
import { useLiveSession } from "../../hooks/useLiveSession";
import { liveStatusLabel, liveVisualTone } from "../../live/liveStateMachine";
import { LiveCameraPreview } from "./LiveCameraPreview";
import { LiveConversationSheet } from "./LiveConversationSheet";
import { LivePermissionCard } from "./LivePermissionCard";
import { LiveVoiceSettingsSheet } from "./LiveVoiceSettingsSheet";
import "./LiveCallMode.css";
import { mediaResourceCoordinator } from "../../features/calls/services/mediaResourceCoordinator";
import { CrystalAiOrb, CrystalErrorBoundary, CrystalVoiceVisualizer } from "../crystal/Crystal";
import type { CrystalOrbState } from "../../crystal/tokens";

export function LiveCallMode({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { settings } = useAppSettings();
  const [language, setLanguage] = useState("hinglish");
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [voiceURI, setVoiceURI] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [conversationOpen, setConversationOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const voiceOptions = useMemo(() => ({ language, rate, volume, voiceURI }), [language, rate, volume, voiceURI]);
  const live = useLiveSession({
    token,
    provider: settings.defaultProvider,
    model: settings.defaultModel,
    voice: voiceOptions,
  });

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      setVoiceURI((current) => current || available.find((voice) => /en-IN|hi-IN/i.test(voice.lang))?.voiceURI || available[0]?.voiceURI || "");
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const marker = { ...window.history.state, autoAiLiveVoiceSettings: true };
    window.history.pushState(marker, "");
    const closeOnBack = () => setSettingsOpen(false);
    const closeOnNativeBack = (event: Event) => {
      event.preventDefault();
      setSettingsOpen(false);
    };
    window.addEventListener("popstate", closeOnBack, { once: true });
    document.addEventListener("backbutton", closeOnNativeBack, { once: true });
    return () => {
      window.removeEventListener("popstate", closeOnBack);
      document.removeEventListener("backbutton", closeOnNativeBack);
    };
  }, [settingsOpen]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    if (window.history.state?.autoAiLiveVoiceSettings) window.history.back();
  }, []);

  useEffect(() => {
    if (live.state === "permission_required" && settingsOpen) closeSettings();
  }, [closeSettings, live.state, settingsOpen]);

  const endAndClose = useCallback(async () => {
    await live.endCall();
    onClose();
  }, [live.endCall, onClose]);

  useEffect(() => {
    const unregister = mediaResourceCoordinator.register("ai-live", endAndClose);
    return () => {
      unregister();
      mediaResourceCoordinator.release("ai-live");
    };
  }, [endAndClose]);

  const time = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const tone = liveVisualTone(live.state);
  const orbState: CrystalOrbState = live.state === "listening" || live.state === "user_speaking"
    ? "listening"
    : live.state === "thinking" || live.state === "processing_speech"
      ? "thinking"
      : live.state === "speaking"
        ? "speaking"
        : live.state === "offline" || live.state === "reconnecting"
          ? "offline"
          : live.state === "error" || live.state === "permission_required"
            ? "error"
            : "ready";
  const voiceActive = live.state === "listening" || live.state === "user_speaking" || live.state === "speaking";
  const permissionRequired = live.state === "permission_required";
  const networkFailure = ["reconnecting", "offline", "error"].includes(live.state);
  const cameraPermissionDenied = Boolean(live.vision.cameraError);
  const shellStyle = {
    "--conversation-panel-height": conversationOpen ? "min(42vh, 360px)" : "54px",
  } as CSSProperties;

  return (
    <main
      className={clsx(
        "live-call",
        live.vision.cameraActive && "camera-active",
        live.vision.native && live.vision.cameraActive && "native-camera-active",
        settingsOpen && "settings-open",
      )}
      style={shellStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Auto-AI Live Mode"
    >
      <LiveCameraPreview
        active={live.vision.cameraActive}
        native={live.vision.native}
        facing={live.vision.cameraFacing}
        status={live.vision.visionStatus}
        previewFrame={live.vision.previewFrame}
        setVideoElement={live.vision.setVideoElement}
      />
      <div className="live-call-vignette" />

      <header className="live-call-topbar">
        <button type="button" className="live-round-button" onClick={endAndClose} aria-label="Close Live Mode"><X size={20} /></button>
        <div className="live-call-identity">
          <strong>Zara</strong>
          <span>{time}</span>
        </div>
        <div className={`live-signal live-signal-${live.connectionStrength}`} title={`${live.connectionStrength} connection`} aria-label={`${live.connectionStrength} connection`}>
          <i /><i /><i /><i />
        </div>
      </header>

      {!live.vision.cameraActive && (
        <section className="live-ai-orb-stage" aria-live="polite">
          <CrystalErrorBoundary>
            <CrystalAiOrb state={orbState} size="lg" label="Live voice status" />
          </CrystalErrorBoundary>
          <CrystalVoiceVisualizer active={voiceActive} state={live.state === "speaking" ? "speaking" : "listening"} />
          <strong>{liveStatusLabel(live.state)}</strong>
          {live.interimTranscript && <p>{live.interimTranscript}</p>}
        </section>
      )}
      {live.vision.cameraActive && (
        <div className={`live-camera-ai-status live-orb-${tone}`}>
          <span /> {liveStatusLabel(live.state)}
        </div>
      )}

      {permissionRequired && (
        <LivePermissionCard
          permanentlyDenied={live.permission?.permanentlyDenied ?? false}
          onTryAgain={() => void live.tryPermissionAgain()}
          onOpenSettings={() => void live.openAppSettings()}
          onClose={endAndClose}
        />
      )}

      {!permissionRequired && (networkFailure || live.error || cameraPermissionDenied) && (
        <aside className={clsx("live-compact-alert", networkFailure && "is-network")} role="status">
          <span>{cameraPermissionDenied ? live.vision.cameraError : live.error || liveStatusLabel(live.state)}</span>
          {networkFailure && live.state !== "reconnecting" && <button type="button" onClick={live.retryConnection}>Retry</button>}
          {cameraPermissionDenied && live.vision.cameraPermission?.permanentlyDenied && (
            <button type="button" onClick={() => void live.vision.openAppSettings()}>Settings</button>
          )}
          {(live.error || cameraPermissionDenied) && <button type="button" onClick={() => { live.clearError(); live.vision.setCameraError(""); }}>Dismiss</button>}
        </aside>
      )}

      <nav className="live-call-controls" aria-label="Live call controls">
        <button type="button" className={clsx("live-round-button", live.vision.cameraActive && "is-active")} onClick={() => void live.toggleCamera()} aria-label={live.vision.cameraActive ? "Turn camera off" : "Turn camera on"}>
          {live.vision.cameraActive ? <Camera size={20} /> : <CameraOff size={20} />}
        </button>
        <button type="button" className="live-round-button" disabled={!live.vision.cameraActive} onClick={() => void live.vision.switchCamera()} aria-label="Switch camera"><RotateCcw size={20} /></button>
        {live.vision.cameraActive && <button type="button" className="live-round-button" onClick={() => void live.manualAnalyze()} aria-label="Analyze current camera scene"><ScanLine size={20} /></button>}
        <button type="button" className={clsx("live-round-button", live.muted && "is-danger")} onClick={() => void live.toggleMute()} aria-label={live.muted ? "Unmute microphone" : "Mute microphone"}>
          {live.muted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button
          type="button"
          className={clsx("live-round-button", settingsOpen && "is-active")}
          disabled={permissionRequired}
          onClick={() => {
            if (settingsOpen) closeSettings();
            else {
              setConversationOpen(false);
              setSettingsOpen(true);
            }
          }}
          aria-label="Voice settings"
        ><Volume2 size={20} /></button>
        {live.state === "error" && <button type="button" className="live-round-button" onClick={live.retryConnection} aria-label="Retry connection"><RefreshCw size={20} /></button>}
        <button type="button" className="live-end-call-button" onClick={endAndClose} aria-label="End call"><PhoneOff size={23} /></button>
      </nav>

      <LiveVoiceSettingsSheet
        open={settingsOpen}
        language={language}
        voiceURI={voiceURI}
        rate={rate}
        volume={volume}
        voices={voices}
        onLanguageChange={setLanguage}
        onVoiceChange={setVoiceURI}
        onRateChange={setRate}
        onVolumeChange={setVolume}
        onClose={closeSettings}
      />

      <LiveConversationSheet
        open={conversationOpen}
        onToggle={() => setConversationOpen((current) => !current)}
        lines={live.lines}
        interimTranscript={live.interimTranscript}
        scrollRef={live.scrollRef}
        onSend={live.sendText}
      />
    </main>
  );
}
