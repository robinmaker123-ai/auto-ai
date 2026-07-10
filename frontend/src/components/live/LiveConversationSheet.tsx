import { ChevronDown, ChevronUp, Send } from "lucide-react";
import { useState, type FormEvent, type RefObject } from "react";
import type { TranscriptLine } from "../../hooks/useTranscript";

type Props = {
  open: boolean;
  onToggle: () => void;
  lines: TranscriptLine[];
  interimTranscript: string;
  scrollRef: RefObject<HTMLDivElement>;
  onSend: (text: string) => Promise<boolean>;
};

export function LiveConversationSheet({ open, onToggle, lines, interimTranscript, scrollRef, onSend }: Props) {
  const [text, setText] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (await onSend(value)) setText("");
  };

  return (
    <section className={`live-conversation ${open ? "is-open" : ""}`} aria-label="Live conversation">
      <button className="live-conversation-header" type="button" onClick={onToggle} aria-expanded={open}>
        <span className="live-conversation-handle" />
        <span>Conversation</span>
        {open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
      </button>
      <div className="live-message-list" ref={scrollRef}>
        {lines.length === 0 && !interimTranscript && <p className="live-empty-conversation">Start speaking naturally…</p>}
        {lines.map((line) => (
          <div key={line.id} className={`live-message live-message-${line.role}`}>
            <span>{line.role === "user" ? "You" : line.role === "assistant" ? "Zara" : "System"}</span>
            <p>{line.text}</p>
          </div>
        ))}
        {interimTranscript && (
          <div className="live-message live-message-partial">
            <span>Listening</span>
            <p>{interimTranscript}</p>
          </div>
        )}
      </div>
      <form className="live-text-form" onSubmit={submit}>
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Type a message…" aria-label="Live message" />
        <button type="submit" disabled={!text.trim()} aria-label="Send live message"><Send size={18} /></button>
      </form>
    </section>
  );
}
