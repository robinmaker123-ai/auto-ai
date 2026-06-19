import { ChangeEvent, useEffect, useRef, useState } from "react";
import { FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { useChat } from "../../contexts/ChatContext";
import type { DocumentItem } from "../../types";

export function DocumentPanel({
  selectedIds,
  setSelectedIds
}: {
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
}) {
  const { token } = useAuth();
  const { activeChat } = useChat();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      setDocuments(await api.listDocuments(token));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("summarize", "true");
    if (activeChat?.id) formData.append("chat_id", activeChat.id);
    const created = await api.uploadDocument(token, formData);
    setSelectedIds([...selectedIds, created.id]);
    await refresh();
    event.target.value = "";
  }

  async function remove(id: string) {
    if (!token || !window.confirm("Delete this document?")) return;
    await api.deleteDocument(token, id);
    setSelectedIds(selectedIds.filter((selectedId) => selectedId !== id));
    await refresh();
  }

  return (
    <aside className="hidden w-80 shrink-0 border-l border-slate-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950 xl:block">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Documents</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-500">PDF, TXT, DOCX</p>
        </div>
        <div className="flex gap-1">
          <button className="icon-button" onClick={refresh} title="Refresh documents">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button className="icon-button" onClick={() => fileInputRef.current?.click()} title="Upload document">
            <Upload size={16} />
          </button>
        </div>
        <input ref={fileInputRef} className="hidden" type="file" accept=".pdf,.txt,.docx" onChange={upload} />
      </div>
      <div className="space-y-2 overflow-y-auto">
        {documents.map((doc) => (
          <div key={doc.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-neutral-800">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                className="mt-1"
                type="checkbox"
                checked={selectedIds.includes(doc.id)}
                onChange={(event) => {
                  setSelectedIds(event.target.checked ? [...selectedIds, doc.id] : selectedIds.filter((id) => id !== doc.id));
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  <FileText size={15} />
                  <span className="truncate">{doc.filename}</span>
                </span>
                {doc.summary && <span className="mt-2 line-clamp-4 block text-xs leading-5 text-slate-600 dark:text-neutral-400">{doc.summary}</span>}
              </span>
            </label>
            <button className="mt-2 inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400" onClick={() => remove(doc.id)}>
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        ))}
        {!documents.length && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-neutral-700 dark:text-neutral-500">No documents uploaded.</p>}
      </div>
    </aside>
  );
}

