import { Link, useLocation } from "react-router-dom";
import { Bot, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useChat } from "../../contexts/ChatContext";

export function Sidebar() {
  const { chats, activeChat, createChat, deleteChat, loadingChats, openChat, updateChat } = useChat();
  const location = useLocation();

  async function renameChat(id: string, currentTitle: string) {
    const nextTitle = window.prompt("Rename chat", currentTitle);
    if (nextTitle?.trim()) {
      await updateChat(id, { title: nextTitle.trim() });
    }
  }

  async function removeChat(id: string) {
    if (window.confirm("Delete this chat?")) {
      await deleteChat(id);
    }
  }

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-slate-950 text-white md:flex md:flex-col">
      <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
        <span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-500">
          <Bot size={20} />
        </span>
        <Link className="font-semibold" to="/">Auto-AI</Link>
      </div>
      <div className="p-3">
        <button className="flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15" onClick={() => createChat()}>
          <MessageSquarePlus size={17} />
          New chat
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {loadingChats && <p className="px-2 py-2 text-sm text-white/50">Loading...</p>}
        {chats.map((chat) => (
          <div key={chat.id} className={clsx("group flex items-center rounded-md", activeChat?.id === chat.id && location.pathname === "/" ? "bg-white/15" : "hover:bg-white/10")}>
            <button className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm" onClick={() => openChat(chat.id)}>
              {chat.title}
            </button>
            <button className="mr-1 rounded p-1 text-white/50 opacity-0 hover:text-white group-hover:opacity-100" onClick={() => renameChat(chat.id, chat.title)} title="Rename chat">
              <Pencil size={15} />
            </button>
            <button className="mr-2 rounded p-1 text-white/50 opacity-0 hover:text-red-300 group-hover:opacity-100" onClick={() => removeChat(chat.id)} title="Delete chat">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
}

