import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Menu, MessageSquarePlus } from "lucide-react";
import { streamChat } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { useChat } from "../../contexts/ChatContext";
import { useAutoScroll } from "../../hooks/useAutoScroll";
import type { Message } from "../../types";
import { Composer } from "./Composer";
import { DocumentPanel } from "./DocumentPanel";
import { MessageBubble } from "./MessageBubble";

export function ChatPage() {
  const { token } = useAuth();
  const { activeChat, createChat, openChat, refreshChats, setActiveChat } = useChat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(activeChat?.messages ?? []);
  }, [activeChat]);

  useAutoScroll(scrollRef, [messages]);

  const hasMessages = messages.length > 0;
  const activeTitle = useMemo(() => activeChat?.title ?? "New chat", [activeChat]);

  function syncActiveChatMessages(chatId: string, nextMessages: Message[]) {
    setActiveChat((current) =>
      current?.id === chatId ? { ...current, messages: nextMessages } : current
    );
  }

  function updateMessagesForChat(
    chatId: string,
    updater: (current: Message[]) => Message[]
  ) {
    setMessages((current) => {
      const nextMessages = updater(current);
      syncActiveChatMessages(chatId, nextMessages);
      return nextMessages;
    });
  }

  async function handleSend(
    text: string,
    options: {
      webSearch: boolean;
      reasoning: boolean;
      provider: "openai" | "groq" | "bedrock";
      model: string;
    }
  ) {
    if (!token) return;
    setStreaming(true);
    const chat = activeChat ?? (await createChat(text.slice(0, 60) || "New chat"));
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      created_at: new Date().toISOString()
    };
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      created_at: new Date().toISOString()
    };
    const optimisticMessages = [...messages, userMessage, assistantMessage];
    setMessages(optimisticMessages);
    syncActiveChatMessages(chat.id, optimisticMessages);

    try {
      let streamFailed = false;
      await streamChat(
        token,
        {
          message: text,
          chat_id: chat.id,
          provider: options.provider,
          model: options.model,
          web_search: options.webSearch,
          reasoning: options.reasoning,
          document_ids: selectedDocumentIds
        },
        (event) => {
          if (event.type === "delta") {
            updateMessagesForChat(chat.id, (current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: message.content + event.delta }
                  : message
              )
            );
          }
          if (event.type === "error") {
            streamFailed = true;
            updateMessagesForChat(chat.id, (current) =>
              current.map((message) =>
                message.id === assistantMessage.id ? { ...message, content: event.detail } : message
              )
            );
          }
        }
      );
      if (!streamFailed) {
        await openChat(chat.id);
      }
      await refreshChats();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to stream response";
      updateMessagesForChat(chat.id, (current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: `AI request failed: ${detail}` }
            : message
        )
      );
      await refreshChats();
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-950 md:hidden">
          <button className="icon-button" title="Menu">
            <Menu size={18} />
          </button>
          <span className="truncate text-sm font-medium">{activeTitle}</span>
          <button className="icon-button" onClick={() => setActiveChat(null)} title="New chat">
            <MessageSquarePlus size={18} />
          </button>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {hasMessages ? (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          ) : (
            <div className="grid h-full place-items-center px-4">
              <div className="max-w-lg text-center">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-md bg-emerald-500 text-white">
                  <Bot size={24} />
                </div>
                <h1 className="text-2xl font-semibold">Auto-AI</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-neutral-400">
                  Ask a question, upload a document, use voice input, or switch on search for current information.
                </p>
              </div>
            </div>
          )}
        </div>
        <Composer disabled={streaming} selectedDocumentCount={selectedDocumentIds.length} onSend={handleSend} />
      </section>
      <DocumentPanel selectedIds={selectedDocumentIds} setSelectedIds={setSelectedDocumentIds} />
    </div>
  );
}
