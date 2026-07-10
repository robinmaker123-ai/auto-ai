export type LiveState =
  | "idle"
  | "checking_microphone_permission"
  | "requesting_microphone_permission"
  | "permission_required"
  | "connecting"
  | "connected"
  | "listening"
  | "user_speaking"
  | "processing_speech"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "offline"
  | "error"
  | "ended";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "error"
  | "ended";

export function liveStatusLabel(state: LiveState) {
  switch (state) {
    case "checking_microphone_permission": return "Checking microphone";
    case "requesting_microphone_permission": return "Waiting for permission";
    case "permission_required": return "Microphone access needed";
    case "connecting": return "Connecting";
    case "connected": return "Connected";
    case "listening": return "Listening";
    case "user_speaking": return "Hearing you";
    case "processing_speech": return "Understanding";
    case "thinking": return "Thinking";
    case "speaking": return "Speaking";
    case "reconnecting": return "Reconnecting";
    case "offline": return "Offline";
    case "error": return "Connection issue";
    case "ended": return "Call ended";
    default: return "Ready";
  }
}

export function liveVisualTone(state: LiveState) {
  if (state === "permission_required") return "permission";
  if (state === "reconnecting" || state === "offline" || state === "error") return "failure";
  if (state === "thinking" || state === "processing_speech") return "thinking";
  if (state === "speaking") return "speaking";
  if (state === "connected") return "connected";
  return "listening";
}
