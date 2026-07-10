import { createContext } from "react";
import type { CallFeatureConfig, CallRecord, CallSessionState, CallType, PublicCallUser } from "./types";

export type CallContextValue = {
  config: CallFeatureConfig | null;
  signalingState: "connecting" | "connected" | "disconnected" | "error";
  sessionState: CallSessionState;
  call: CallRecord | null;
  peer: PublicCallUser | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraEnabled: boolean;
  remoteCameraEnabled: boolean;
  speakerEnabled: boolean;
  networkQuality: "good" | "fair" | "poor" | "unknown";
  error: string;
  startCall: (user: PublicCallUser, callType?: CallType) => Promise<void>;
  acceptCall: (audioOnly?: boolean) => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: (reason?: string) => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => Promise<void>;
  switchCamera: () => Promise<void>;
  toggleSpeaker: () => Promise<void>;
  clearError: () => void;
};

export const CallContext = createContext<CallContextValue | undefined>(undefined);
