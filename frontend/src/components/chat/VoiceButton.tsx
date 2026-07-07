import { Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4"
];

function supportedRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function audioFilename(mimeType: string) {
  if (mimeType.includes("ogg")) return "voice.ogg";
  if (mimeType.includes("mp4")) return "voice.m4a";
  return "voice.webm";
}

export function VoiceButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const { token } = useAuth();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("");
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function startRecording() {
    setError(false);
    if (!token || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(true);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(true);
      return;
    }
    const mimeType = supportedRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError(true);
      return;
    }
    streamRef.current = stream;
    mimeTypeRef.current = mimeType || recorder.mimeType || "audio/webm";
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setLoading(true);
      try {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        if (!blob.size) throw new Error("Empty recording");
        const result = await api.transcribeAudio(token, blob, audioFilename(blob.type));
        if (result.text.trim()) onTranscript(result.text.trim());
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    recorder.onerror = () => {
      setError(true);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setRecording(true);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "recording") recorder.requestData();
    recorder.stop();
  }

  return (
    <button
      className={error ? "icon-button-danger" : "icon-button-dark"}
      disabled={loading}
      onClick={recording ? stopRecording : startRecording}
      title={recording ? "Stop recording" : "Record voice"}
      type="button"
    >
      {recording ? <Square size={18} /> : <Mic size={18} />}
    </button>
  );
}
