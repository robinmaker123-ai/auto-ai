import { API_BASE_URL, apiFetch } from "../../api/client";
import type { ChatRealtimeEvent, ChatSettings, ChatUserPage, MessagePage, ThreadPage, UserMessage, UserThread } from "./types";

export const userMessagesApi = {
  listThreads: (token: string, archived?: boolean) =>
    apiFetch<ThreadPage>(`/messages${archived === undefined ? "" : `?archived=${archived}`}`, { token, operation: "messages.threads.list" }),
  searchUsers: (token: string, query: string, page = 1) =>
    apiFetch<ChatUserPage>(`/messages/search-users?query=${encodeURIComponent(query)}&page=${page}`, { token, operation: "messages.users.search" }),
  createThread: (token: string, peerUserId: string) =>
    apiFetch<UserThread>("/messages/threads", { method: "POST", token, operation: "messages.threads.create", body: JSON.stringify({ peer_user_id: peerUserId }) }),
  getThread: (token: string, threadId: string) =>
    apiFetch<UserThread>(`/messages/threads/${threadId}`, { token, operation: "messages.threads.get" }),
  listMessages: (token: string, threadId: string, before?: string) =>
    apiFetch<MessagePage>(`/messages/threads/${threadId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`, { token, operation: "messages.list" }),
  sendMessage: (token: string, threadId: string, payload: { text_content: string; client_message_id: string }) =>
    apiFetch<UserMessage>(`/messages/threads/${threadId}/messages`, { method: "POST", token, operation: "messages.send", body: JSON.stringify(payload) }),
  sendAttachment: (token: string, threadId: string, file: File, textContent: string, clientMessageId: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("client_message_id", clientMessageId);
    if (textContent.trim()) formData.append("text_content", textContent.trim());
    return apiFetch<UserMessage>(`/messages/threads/${threadId}/attachments`, { method: "POST", token, operation: "messages.attachments.send", body: formData });
  },
  markRead: (token: string, threadId: string) =>
    apiFetch<void>(`/messages/threads/${threadId}/read`, { method: "POST", token, operation: "messages.read" }),
  markDelivered: (token: string, threadId: string) =>
    apiFetch<void>(`/messages/threads/${threadId}/delivered`, { method: "POST", token, operation: "messages.delivered" }),
  setArchive: (token: string, threadId: string, enabled: boolean) =>
    apiFetch<UserThread>(`/messages/threads/${threadId}/archive`, { method: "POST", token, operation: "messages.archive", body: JSON.stringify({ enabled }) }),
  setPin: (token: string, threadId: string, enabled: boolean) =>
    apiFetch<UserThread>(`/messages/threads/${threadId}/pin`, { method: "POST", token, operation: "messages.pin", body: JSON.stringify({ enabled }) }),
  setMute: (token: string, threadId: string, enabled: boolean) =>
    apiFetch<UserThread>(`/messages/threads/${threadId}/mute`, { method: "POST", token, operation: "messages.mute", body: JSON.stringify({ enabled }) }),
  settings: (token: string) => apiFetch<ChatSettings>("/messages/settings", { token, operation: "messages.settings" }),
  updateSettings: (token: string, payload: Partial<ChatSettings>) =>
    apiFetch<ChatSettings>("/messages/settings", { method: "PATCH", token, operation: "messages.settings.update", body: JSON.stringify(payload) }),
};

export class UserMessageSocket {
  private socket: WebSocket | null = null;
  private queue: ChatRealtimeEvent[] = [];
  private closed = false;
  private reconnectTimer = 0;

  constructor(private token: string, private onEvent: (event: ChatRealtimeEvent) => void, private onState: (state: "connecting" | "connected" | "disconnected") => void) {}

  connect() {
    this.closed = false;
    this.onState("connecting");
    const wsUrl = `${API_BASE_URL.replace(/^http/, "ws")}/messages/ws?token=${encodeURIComponent(this.token)}`;
    this.socket = new WebSocket(wsUrl);
    this.socket.onopen = () => {
      this.onState("connected");
      const pending = this.queue.splice(0);
      pending.forEach((event) => this.send(event));
    };
    this.socket.onmessage = (message) => {
      try {
        this.onEvent(JSON.parse(message.data) as ChatRealtimeEvent);
      } catch {
        return;
      }
    };
    this.socket.onclose = () => {
      this.onState("disconnected");
      if (!this.closed) this.reconnectTimer = window.setTimeout(() => this.connect(), 1800);
    };
  }

  send(event: ChatRealtimeEvent) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    } else {
      this.queue.push(event);
    }
  }

  close() {
    this.closed = true;
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}
