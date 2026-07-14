import { useCallback, useEffect, useState } from "react";
import { Eye, History, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { cmsApi } from "./cmsApi";
import type { CmsAudit, CmsRevision } from "./types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export function CmsRevisionManager({ canPublish }: { canPublish: boolean }) {
  const { token } = useAuth();
  const [revisions, setRevisions] = useState<CmsRevision[]>([]);
  const [audit, setAudit] = useState<CmsAudit[]>([]);
  const [preview, setPreview] = useState<CmsRevision | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [revisionResult, auditResult] = await Promise.all([cmsApi.revisions(token), cmsApi.audit(token)]);
      setRevisions(revisionResult.items);
      setAudit(auditResult.items);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load history");
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function restore(revision: CmsRevision) {
    if (!token || !canPublish || revision.content_type !== "page" || !window.confirm("Restore this revision as a new draft? Existing history will be preserved.")) return;
    setBusy(revision.id);
    try {
      const page = await cmsApi.page(token, revision.content_id);
      await cmsApi.restoreRevision(token, revision, page.version);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Restore failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-white">Revision History</h2><p className="text-sm text-slate-400">Immutable publish snapshots and content audit activity.</p></div>
        <button className="btn-secondary" onClick={() => void load()} type="button"><RefreshCw size={15} /> Refresh</button>
      </div>
      {error && <p className="mb-3 rounded border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><History size={16} /> Revisions</h3>
          <div className="overflow-x-auto border border-white/10"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-white/[0.04] text-xs uppercase text-slate-400"><tr><th className="px-3 py-2">Content</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Administrator</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Actions</th></tr></thead><tbody className="divide-y divide-white/10">{revisions.map((item) => <tr key={item.id}><td className="px-3 py-3"><strong className="text-white">{item.content_type}</strong><small className="block text-slate-500">v{item.version} · {item.change_summary}</small></td><td className="px-3 py-3"><span className={`cms-status cms-status-${item.status}`}>{item.action}</span></td><td className="px-3 py-3 text-slate-300">{item.administrator}</td><td className="px-3 py-3 text-slate-400">{formatDate(item.created_at)}</td><td className="px-3 py-3"><div className="flex gap-1"><button className="icon-button-dark" aria-label="Preview revision" onClick={() => setPreview(item)} type="button"><Eye size={15} /></button>{canPublish && item.content_type === "page" && <button className="icon-button-dark" aria-label="Restore revision" disabled={busy === item.id} onClick={() => void restore(item)} type="button"><RotateCcw size={15} /></button>}</div></td></tr>)}{!revisions.length && <tr><td className="px-3 py-6 text-slate-400" colSpan={5}>No publish revisions yet.</td></tr>}</tbody></table></div>
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck size={16} /> Audit log</h3>
          <div className="max-h-[620px] overflow-y-auto border border-white/10"><ul className="divide-y divide-white/10">{audit.map((item) => <li className="p-3" key={item.id}><div className="flex justify-between gap-3"><strong className="text-sm text-white">{item.administrator} · {item.action}</strong><time className="text-xs text-slate-500">{formatDate(item.created_at)}</time></div><p className="mt-1 text-sm text-slate-300">{item.summary || `${item.content_type} updated`}</p><small className="text-slate-500">{item.content_type} · {item.content_id}</small></li>)}{!audit.length && <li className="p-6 text-sm text-slate-400">No content activity yet.</li>}</ul></div>
        </div>
      </div>

      {preview && <div className="cms-preview-overlay" role="dialog" aria-modal="true" aria-label="Revision preview"><div className="cms-revision-dialog"><header className="flex items-center justify-between border-b border-white/10 p-3"><div><strong className="text-white">Revision {preview.version}</strong><p className="text-xs text-slate-400">{preview.change_summary}</p></div><button className="btn-secondary" onClick={() => setPreview(null)} type="button">Close</button></header><div className="max-h-[70vh] overflow-auto p-4"><h3 className="mb-2 text-sm font-semibold text-white">Changed fields</h3><div className="space-y-2">{Object.entries(preview.changes).map(([key, change]) => <div className="rounded border border-white/10 p-3" key={key}><strong className="text-xs uppercase text-cyan-200">{key}</strong><div className="mt-2 grid gap-2 md:grid-cols-2"><pre className="whitespace-pre-wrap text-xs text-red-100">{JSON.stringify(change.previous, null, 2)}</pre><pre className="whitespace-pre-wrap text-xs text-emerald-100">{JSON.stringify(change.new, null, 2)}</pre></div></div>)}</div></div></div></div>}
    </section>
  );
}
