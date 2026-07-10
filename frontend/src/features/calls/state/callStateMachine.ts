import type { CallSessionState } from "../types";

const transitions: Record<CallSessionState, ReadonlySet<CallSessionState>> = {
  idle: new Set(["preparing", "incoming"]),
  preparing: new Set(["dialing", "notifying", "failed", "ending"]),
  dialing: new Set(["notifying", "ringing", "connecting", "busy", "cancelled", "missed", "failed", "ending"]),
  notifying: new Set(["ringing", "connecting", "busy", "cancelled", "missed", "failed", "ending"]),
  ringing: new Set(["connecting", "rejected", "cancelled", "missed", "busy", "failed", "ending"]),
  incoming: new Set(["accepting", "rejected", "cancelled", "missed", "busy", "failed", "ending"]),
  accepting: new Set(["connecting", "cancelled", "missed", "failed", "ending"]),
  connecting: new Set(["active", "reconnecting", "failed", "ending"]),
  active: new Set(["reconnecting", "ending", "failed"]),
  reconnecting: new Set(["active", "failed", "ending"]),
  ending: new Set(["ended", "failed"]),
  ended: new Set(["idle"]),
  rejected: new Set(["ended", "idle"]),
  cancelled: new Set(["ended", "idle"]),
  missed: new Set(["ended", "idle"]),
  busy: new Set(["ended", "idle"]),
  failed: new Set(["ended", "idle"]),
};

export function canTransition(from: CallSessionState, to: CallSessionState) {
  return from === to || transitions[from].has(to);
}

export function nextCallState(from: CallSessionState, to: CallSessionState) {
  return canTransition(from, to) ? to : from;
}
