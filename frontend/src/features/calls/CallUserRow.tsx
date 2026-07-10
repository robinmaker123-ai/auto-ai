import { Ban, EllipsisVertical, Flag, Phone, Video } from "lucide-react";
import { useState } from "react";
import type { CallType, PublicCallUser } from "./types";

export function CallUserRow({
  user,
  onCall,
  onBlock,
  onReport,
}: {
  user: PublicCallUser;
  onCall: (user: PublicCallUser, type: CallType) => void;
  onBlock: (user: PublicCallUser) => void;
  onReport: (user: PublicCallUser) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const statusClass = user.presence === "online" ? "online" : user.presence === "away" ? "away" : user.presence === "busy" ? "busy" : "offline";
  return (
    <div className="call-user-row">
      <span className="call-user-avatar">
        {user.avatar_url ? <img src={user.avatar_url} alt="" /> : <span>{user.display_name.slice(0, 1).toUpperCase()}</span>}
        <i className={`call-presence-dot ${statusClass}`} aria-label={user.availability} />
      </span>
      <span className="call-user-copy">
        <strong>{user.display_name}</strong>
        <small>@{user.username} · {user.availability}</small>
      </span>
      <span className="call-user-actions">
        <button type="button" onClick={() => onCall(user, "audio")} disabled={!user.can_audio_call} title="Audio call" aria-label={`Audio call ${user.display_name}`}><Phone size={16} /></button>
        <button type="button" onClick={() => onCall(user, "video")} disabled={!user.can_video_call} title="Video call" aria-label={`Video call ${user.display_name}`}><Video size={17} /></button>
        <span className="call-user-menu-wrap">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} title="More options" aria-label={`Options for ${user.display_name}`}><EllipsisVertical size={17} /></button>
          {menuOpen && (
            <span className="call-user-menu">
              <button type="button" onClick={() => { setMenuOpen(false); onBlock(user); }}><Ban size={14} /> Block</button>
              <button type="button" onClick={() => { setMenuOpen(false); onReport(user); }}><Flag size={14} /> Report</button>
            </span>
          )}
        </span>
      </span>
    </div>
  );
}
