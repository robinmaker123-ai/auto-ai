import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { usePublishedAnnouncements } from "../../hooks/useCmsContent";
import { isAdminPanelRole } from "../../utils/roles";

function audienceForUser(subscription?: string, role?: string) {
  if (isAdminPanelRole(role)) return "admin";
  return subscription && !["free", "inactive", "expired"].includes(subscription.toLowerCase()) ? "paid" : "free";
}

export function AnnouncementBanner() {
  const { user } = useAuth();
  const announcements = usePublishedAnnouncements(audienceForUser(user?.subscription_status, user?.role));
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("auto-ai-dismissed-announcements") || "{}"); } catch { return {}; }
  });
  const item = announcements?.find((announcement) => !dismissed[announcement.id]);
  if (!item) return null;

  function dismiss() {
    const next = { ...dismissed, [item!.id]: true };
    setDismissed(next);
    try { localStorage.setItem("auto-ai-dismissed-announcements", JSON.stringify(next)); } catch { /* Non-critical. */ }
  }

  return (
    <aside className="announcement-banner" aria-label={item.title}>
      <div><strong>{item.title}</strong><span>{item.message}</span></div>
      <div className="flex items-center gap-2">
        {item.action_text && item.target_url && <a className="chip-dark" href={item.target_url}><ExternalLink size={13} /> {item.action_text}</a>}
        {item.dismissible && <button className="icon-button-dark" aria-label="Dismiss announcement" onClick={dismiss} type="button"><X size={15} /></button>}
      </div>
    </aside>
  );
}
