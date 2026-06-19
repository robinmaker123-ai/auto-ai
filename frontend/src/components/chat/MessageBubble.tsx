import { Bot, Copy, Volume2, User } from "lucide-react";
import clsx from "clsx";
import type { Message } from "../../types";
import { MarkdownMessage } from "./MarkdownMessage";

export function MessageBubble({ message }: { message: Message }) {
  const isAssistant = message.role === "assistant";

  function copyMessage() {
    navigator.clipboard.writeText(message.content);
  }

  function speakMessage() {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <article className={clsx("group flex gap-3 px-4 py-5 md:px-8", isAssistant ? "bg-slate-100 dark:bg-neutral-900/70" : "bg-white dark:bg-neutral-950")}>
      <div className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-md", isAssistant ? "bg-emerald-500 text-white" : "bg-cyan-600 text-white")}>
        {isAssistant ? <Bot size={18} /> : <User size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="prose prose-slate max-w-none dark:prose-invert prose-pre:m-0 prose-pre:bg-transparent">
          <MarkdownMessage content={message.content} />
        </div>
        <div className="mt-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button className="icon-button h-8 w-8" onClick={copyMessage} title="Copy message">
            <Copy size={15} />
          </button>
          {isAssistant && (
            <button className="icon-button h-8 w-8" onClick={speakMessage} title="Read aloud">
              <Volume2 size={15} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

