import { ArrowLeft, PhoneCall, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CallsTab } from "./CallsTab";

export function CallsPage() {
  const navigate = useNavigate();
  return (
    <main className="calls-workspace-page">
      <header className="calls-workspace-header">
        <button type="button" onClick={() => navigate("/chat")} title="Back to chat" aria-label="Back to chat"><ArrowLeft size={18} /></button>
        <span><PhoneCall size={18} /><span><strong>Calls</strong><small>Audio and video</small></span></span>
        <button type="button" onClick={() => navigate("/settings?section=calls")} title="Call settings" aria-label="Open call settings"><Settings size={18} /></button>
      </header>
      <section className="calls-workspace-content">
        <CallsTab />
      </section>
    </main>
  );
}
