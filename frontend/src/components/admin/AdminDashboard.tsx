import { useEffect, useState } from "react";
import { Activity, Database, FileText, MessageSquare, Users } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import type { AdminStats } from "../../types";

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-cyan-600 text-white">{icon}</div>
      <p className="text-sm text-slate-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function AdminDashboard() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !user?.is_admin) return;
    api.adminStats(token).then(setStats).catch((err) => setError(err instanceof Error ? err.message : "Unable to load stats"));
  }, [token, user?.is_admin]);

  if (!user?.is_admin) {
    return <div className="p-6 text-sm text-slate-600 dark:text-neutral-400">Admin access required.</div>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">Usage and system health</p>
      </div>
      {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile icon={<Users size={18} />} label="Users" value={stats.user_count} />
            <StatTile icon={<MessageSquare size={18} />} label="Chats" value={stats.chat_count} />
            <StatTile icon={<Activity size={18} />} label="Messages" value={stats.message_count} />
            <StatTile icon={<FileText size={18} />} label="Documents" value={stats.document_count} />
            <StatTile icon={<Database size={18} />} label="API calls" value={stats.api_calls} />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="mb-3 text-sm font-semibold">Token Usage</h2>
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between"><dt>Prompt tokens</dt><dd>{stats.token_usage.prompt_tokens.toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt>Completion tokens</dt><dd>{stats.token_usage.completion_tokens.toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt>Total tokens</dt><dd>{stats.token_usage.total_tokens.toLocaleString()}</dd></div>
              </dl>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="mb-3 text-sm font-semibold">System</h2>
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between"><dt>Environment</dt><dd>{stats.system.environment}</dd></div>
                <div className="flex justify-between"><dt>Database</dt><dd>{stats.system.database_backend}</dd></div>
                <div className="flex justify-between"><dt>Python</dt><dd>{stats.system.python_version}</dd></div>
                <div className="flex justify-between"><dt>Free storage</dt><dd>{stats.system.storage_free_gb} GB</dd></div>
              </dl>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

