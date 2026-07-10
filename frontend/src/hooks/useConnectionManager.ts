import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../api/client";
import type { ConnectionState } from "../live/liveStateMachine";

export type LiveServerEvent = { type: string; [key: string]: unknown };

type StartPayload = {
  session_id?: string;
  language: string;
  provider?: string | null;
  model?: string | null;
  camera_on: boolean;
};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

class LiveConnectionManager {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private intentionalClose = false;
  private suspended = false;
  private startPayload: StartPayload | null = null;
  private stateHandler: (state: ConnectionState) => void;
  private eventHandler: (event: LiveServerEvent) => void;
  private healthHandler: (timestamp: number) => void;

  constructor(
    private readonly token: string,
    stateHandler: (state: ConnectionState) => void,
    eventHandler: (event: LiveServerEvent) => void,
    healthHandler: (timestamp: number) => void,
  ) {
    this.stateHandler = stateHandler;
    this.eventHandler = eventHandler;
    this.healthHandler = healthHandler;
  }

  connect(payload: StartPayload) {
    this.startPayload = { ...payload, session_id: payload.session_id || this.startPayload?.session_id };
    this.intentionalClose = false;
    this.suspended = false;
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    this.open(false);
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  updateSessionId(sessionId: string) {
    if (this.startPayload) this.startPayload.session_id = sessionId;
  }

  updateCameraState(cameraOn: boolean) {
    this.configure({ camera_on: cameraOn });
  }

  configure(payload: Partial<StartPayload>) {
    if (!this.startPayload) return;
    this.startPayload = { ...this.startPayload, ...payload };
    this.send("session.start", this.startPayload);
  }

  retry() {
    this.cancelReconnect();
    this.attempts = 0;
    this.intentionalClose = false;
    if (navigator.onLine === false) {
      this.stateHandler("offline");
      return;
    }
    this.open(false);
  }

  suspend() {
    this.suspended = true;
    this.intentionalClose = true;
    this.cancelTimers();
    this.closeSocket();
    this.stateHandler("idle");
  }

  resume() {
    if (!this.suspended || !this.startPayload) return;
    this.suspended = false;
    this.intentionalClose = false;
    this.open(true);
  }

  disconnect(endSession: boolean) {
    this.intentionalClose = true;
    this.suspended = false;
    this.cancelTimers();
    if (endSession && this.socket?.readyState === WebSocket.OPEN) {
      this.send("session.end");
    }
    this.closeSocket();
    this.stateHandler(endSession ? "ended" : "idle");
  }

  networkChanged(online: boolean) {
    if (!online) {
      this.cancelReconnect();
      this.stateHandler("offline");
      this.closeSocket();
      return;
    }
    if (!this.intentionalClose && !this.suspended && this.startPayload) {
      this.cancelReconnect();
      this.open(true);
    }
  }

  private open(reconnecting: boolean) {
    if (!this.startPayload || this.intentionalClose || this.suspended) return;
    if (navigator.onLine === false) {
      this.stateHandler("offline");
      return;
    }
    this.closeSocket();
    this.stateHandler(reconnecting ? "reconnecting" : "connecting");
    const socket = new WebSocket(liveSocketUrl(this.token));
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.startHealthChecks();
      socket.send(JSON.stringify({ type: "session.start", ...this.startPayload }));
    };
    socket.onmessage = (message) => {
      if (this.socket !== socket) return;
      let event: LiveServerEvent;
      try { event = JSON.parse(String(message.data)) as LiveServerEvent; } catch { return; }
      if (event.type === "pong") {
        this.healthHandler(Date.now());
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
      if (event.type === "session.ready") {
        this.attempts = 0;
        this.stateHandler("connected");
        if (typeof event.session_id === "string") this.updateSessionId(event.session_id);
      }
      this.eventHandler(event);
    };
    socket.onerror = () => {
      // onclose owns retry scheduling so there is never more than one timer.
    };
    socket.onclose = () => {
      const wasCurrentSocket = this.socket === socket;
      if (wasCurrentSocket) this.socket = null;
      if (!wasCurrentSocket && this.socket) return;
      this.cancelHealthChecks();
      if (this.intentionalClose || this.suspended) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (navigator.onLine === false) {
      this.stateHandler("offline");
      return;
    }
    if (this.reconnectTimer || this.attempts >= MAX_RECONNECT_ATTEMPTS) {
      if (this.attempts >= MAX_RECONNECT_ATTEMPTS) this.stateHandler("error");
      return;
    }
    this.stateHandler("reconnecting");
    const delay = RECONNECT_DELAYS[Math.min(this.attempts, RECONNECT_DELAYS.length - 1)];
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open(true);
    }, delay);
  }

  private startHealthChecks() {
    this.cancelHealthChecks();
    this.healthHandler(Date.now());
    this.pingTimer = setInterval(() => {
      if (!this.send("ping", { timestamp: Date.now() })) return;
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        this.socket?.close(4000, "pong timeout");
      }, 10000);
    }, 20000);
  }

  private closeSocket() {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000);
  }

  private cancelReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private cancelHealthChecks() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }

  private cancelTimers() {
    this.cancelReconnect();
    this.cancelHealthChecks();
  }
}

function liveSocketUrl(token: string) {
  const api = new URL(API_BASE_URL, window.location.origin);
  api.protocol = api.protocol === "https:" ? "wss:" : "ws:";
  api.pathname = `${api.pathname.replace(/\/$/, "")}/live/ws`;
  api.search = new URLSearchParams({ token }).toString();
  return api.toString();
}

export function useConnectionManager(token: string | null, onEvent: (event: LiveServerEvent) => void) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [lastHealthAt, setLastHealthAt] = useState(0);
  const eventRef = useRef(onEvent);
  const managerRef = useRef<LiveConnectionManager | null>(null);
  eventRef.current = onEvent;

  useEffect(() => {
    if (!token) return;
    const manager = new LiveConnectionManager(token, setConnectionState, (event) => eventRef.current(event), setLastHealthAt);
    managerRef.current = manager;
    const online = () => manager.networkChanged(true);
    const offline = () => manager.networkChanged(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      manager.disconnect(false);
      managerRef.current = null;
    };
  }, [token]);

  const connect = useCallback((payload: StartPayload) => managerRef.current?.connect(payload), []);
  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => managerRef.current?.send(type, payload) ?? false, []);
  const retry = useCallback(() => managerRef.current?.retry(), []);
  const disconnect = useCallback((endSession: boolean) => managerRef.current?.disconnect(endSession), []);
  const suspend = useCallback(() => managerRef.current?.suspend(), []);
  const resume = useCallback(() => managerRef.current?.resume(), []);
  const updateCameraState = useCallback((cameraOn: boolean) => managerRef.current?.updateCameraState(cameraOn), []);
  const configure = useCallback((payload: Partial<StartPayload>) => managerRef.current?.configure(payload), []);

  return { connectionState, lastHealthAt, connect, send, retry, disconnect, suspend, resume, updateCameraState, configure };
}
