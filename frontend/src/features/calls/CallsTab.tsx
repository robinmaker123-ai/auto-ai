import { Clock3, LoaderCircle, RefreshCw, Search, ShieldAlert, Users, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { CallUserRow } from "./CallUserRow";
import { useCallSession } from "./hooks/useCallSession";
import { callApi } from "./services/callApi";
import type { CallRecord, CallType, PublicCallUser } from "./types";

export function CallsTab() {
  const { token } = useAuth();
  const { config, signalingState, startCall } = useCallSession();
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState<PublicCallUser[]>([]);
  const [results, setResults] = useState<PublicCallUser[]>([]);
  const [history, setHistory] = useState<CallRecord[]>([]);
  const [view, setView] = useState<"people" | "recent">("people");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const searchAbortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !config?.enabled || !config.realtime_configured) return;
    setLoading(true);
    setMessage("");
    try {
      const [active, recent] = await Promise.all([callApi.onlineUsers(token), callApi.history(token, 1, 20)]);
      setOnline(active.items);
      setHistory(recent.items);
    } catch (refreshError) {
      setMessage(refreshError instanceof Error ? refreshError.message : "Unable to load calls.");
    } finally {
      setLoading(false);
    }
  }, [config?.enabled, config?.realtime_configured, token]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 25_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    searchAbortRef.current?.abort();
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const timer = window.setTimeout(async () => {
      if (!token) return;
      setLoading(true);
      setMessage("");
      try {
        const page = await callApi.searchUsers(token, normalized, 1, 20, controller.signal);
        setResults(page.items);
      } catch (searchError) {
        if (!controller.signal.aborted) setMessage(searchError instanceof Error ? searchError.message : "Search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, token]);

  async function blockUser(user: PublicCallUser) {
    if (!token || !window.confirm(`Block ${user.display_name}? They will no longer be able to find or call you.`)) return;
    await callApi.block(token, user.id);
    setOnline((items) => items.filter((item) => item.id !== user.id));
    setResults((items) => items.filter((item) => item.id !== user.id));
  }

  async function reportUser(user: PublicCallUser) {
    if (!token) return;
    const details = window.prompt(`Report ${user.display_name}. Briefly describe the issue:`);
    if (!details?.trim()) return;
    await callApi.report(token, { user_id: user.id, reason: "other", details: details.trim() });
    setMessage("Report submitted.");
  }

  function placeCall(user: PublicCallUser, type: CallType) {
    void startCall(user, type);
  }

  if (!config) return <div className="calls-empty"><LoaderCircle className="animate-spin" size={20} /> Loading calls…</div>;
  if (!config.enabled) return <div className="calls-empty"><WifiOff size={22} /> Calls are disabled.</div>;
  if (!config.realtime_configured) return <div className="calls-empty"><WifiOff size={22} /> {config.diagnostic || "Realtime calls are unavailable."}</div>;

  const visibleUsers = query.trim().length >= 2 ? results : online;
  return (
    <div className="calls-tab">
      <div className="calls-search-wrap">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users by name or username" aria-label="Search users by name or username" />
        {loading && <LoaderCircle className="animate-spin" size={15} />}
      </div>
      <div className="calls-subtabs">
        <button type="button" className={view === "people" ? "active" : ""} onClick={() => setView("people")}><Users size={14} /> People</button>
        <button type="button" className={view === "recent" ? "active" : ""} onClick={() => setView("recent")}><Clock3 size={14} /> Recent</button>
        <button type="button" onClick={() => void refresh()} title="Refresh calls" aria-label="Refresh calls"><RefreshCw size={14} /></button>
      </div>
      {signalingState !== "connected" && <div className="calls-inline-alert"><WifiOff size={14} /> Reconnecting to calls…</div>}
      {message && <div className="calls-inline-alert"><ShieldAlert size={14} /> {message}</div>}
      {view === "people" ? (
        <div className="calls-list">
          <p className="calls-section-label">{query.trim().length >= 2 ? "Search results" : "Active now"}</p>
          {visibleUsers.map((item) => <CallUserRow key={item.id} user={item} onCall={placeCall} onBlock={(user) => void blockUser(user)} onReport={(user) => void reportUser(user)} />)}
          {!loading && visibleUsers.length === 0 && <div className="calls-empty">{query.trim().length >= 2 ? "No users found" : "No available users are online"}</div>}
          {query.trim().length === 1 && <div className="calls-empty">Type at least 2 characters to search</div>}
        </div>
      ) : (
        <div className="calls-list">
          <p className="calls-section-label">Call history</p>
          {history.map((item) => (
            <div className="call-history-row" key={item.id}>
              <span className="call-user-avatar">{item.peer.avatar_url ? <img src={item.peer.avatar_url} alt="" /> : item.peer.display_name.slice(0, 1).toUpperCase()}</span>
              <span><strong>{item.peer.display_name}</strong><small>{item.direction === "incoming" ? "Incoming" : "Outgoing"} {item.call_type} · {item.status}</small></span>
              <button type="button" onClick={() => placeCall(item.peer, item.call_type)} disabled={item.call_type === "video" ? !item.peer.can_video_call : !item.peer.can_audio_call} aria-label={`Call ${item.peer.display_name}`}><RefreshCw size={15} /></button>
            </div>
          ))}
          {!history.length && <div className="calls-empty">No calls yet</div>}
        </div>
      )}
    </div>
  );
}
