import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  Database,
  Globe,
  Info,
  Languages,
  Monitor,
  Moon,
  RotateCcw,
  Settings,
  Shield,
  Sun,
  User,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "../../contexts/AuthContext";
import { useChat } from "../../contexts/ChatContext";
import { useTheme } from "../../contexts/ThemeContext";

type SettingsTab = "general" | "profile" | "data" | "about";
type AppearanceTheme = "light" | "dark" | "system";
type AppLanguage = "system" | "en" | "hi";

const LANGUAGE_STORAGE_KEY = "auto-ai-language";
const SETTINGS_TABS = [
  { value: "general", label: "General", icon: Globe },
  { value: "profile", label: "Profile", icon: User },
  { value: "data", label: "Data", icon: Database },
  { value: "about", label: "About", icon: Info }
] as const;

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
] as const;

function readLanguage(): AppLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as AppLanguage | null;
  return stored === "en" || stored === "hi" || stored === "system" ? stored : "system";
}

function formatJoinedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function themeLabel(theme: AppearanceTheme) {
  if (theme === "light") return "Light";
  if (theme === "dark") return "Dark";
  return "System";
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { chats, activeChat } = useChat();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [tab, setTab] = useState<SettingsTab>("general");
  const [language, setLanguage] = useState<AppLanguage>(() => readLanguage());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("general");
  }, [open]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const summary = useMemo(
    () => ({
      chats: chats.length,
      activeMessages: activeChat?.messages.length ?? 0,
      admin: user?.is_admin ? "Admin" : "Member"
    }),
    [activeChat?.messages.length, chats.length, user?.is_admin]
  );

  async function copyDiagnostics() {
    const payload = {
      user: user?.email,
      theme,
      resolvedTheme,
      language,
      chats: chats.length,
      activeChat: activeChat?.title ?? null,
      messages: activeChat?.messages.length ?? 0,
      time: new Date().toISOString()
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
  }

  function resetAppearance() {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    setLanguage("system");
    setTheme("system");
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-3 py-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            className="relative flex h-[min(720px,calc(100vh-2rem))] w-[min(100%,980px)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 text-white shadow-[0_28px_90px_rgba(0,0,0,0.5)]"
            initial={{ y: 24, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 14, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            onClick={(event) => event.stopPropagation()}
          >
          <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-white/[0.03] p-4 md:flex md:flex-col">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">Settings</p>
                <h2 className="mt-1 text-lg font-semibold">Preferences</h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">
                <Settings size={18} />
              </span>
            </div>

            <nav className="space-y-2">
              {SETTINGS_TABS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value as SettingsTab)}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition",
                    tab === value
                      ? "border-cyan-200/25 bg-cyan-200/12 text-cyan-50 shadow-[0_10px_30px_rgba(34,211,238,0.12)]"
                      : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
                  )}
                >
                  <Icon size={16} className={tab === value ? "text-cyan-200" : "text-slate-400"} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-300">
              Theme and language are saved locally. The app will remember your preference next time.
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 md:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80 md:hidden">Settings</p>
                <h3 className="text-base font-semibold md:text-lg">{tab === "general" ? "General" : tab === "profile" ? "Profile" : tab === "data" ? "Data" : "About"}</h3>
              </div>
              <button className="icon-button-dark" onClick={onClose} type="button" title="Close settings">
                <X size={16} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
              <div className="grid gap-3 md:hidden">
                <div className="grid grid-cols-2 gap-2">
                  {SETTINGS_TABS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value as SettingsTab)}
                      className={clsx(
                        "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition",
                        tab === value
                          ? "border-cyan-200/25 bg-cyan-200/12 text-cyan-50"
                          : "border-white/10 bg-white/[0.03] text-slate-300"
                      )}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {tab === "general" && (
                <div className="space-y-6">
                  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                      <Monitor size={16} className="text-cyan-300" />
                      Theme
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                        const active = theme === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setTheme(value as AppearanceTheme)}
                            className={clsx(
                              "flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border px-4 text-center transition",
                              active
                                ? "border-cyan-200/30 bg-cyan-200/12 text-cyan-50 shadow-[0_12px_34px_rgba(34,211,238,0.12)]"
                                : "border-white/10 bg-slate-900/40 text-slate-300 hover:border-white/20 hover:bg-white/[0.05]"
                            )}
                          >
                            <Icon size={24} className={active ? "text-cyan-200" : "text-slate-400"} />
                            <div className="text-sm font-semibold">{label}</div>
                            {value === "system" && <div className="text-[11px] text-slate-400">Follows your device</div>}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                      <Languages size={16} className="text-fuchsia-300" />
                      Language
                    </div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm leading-6 text-slate-300">
                        Choose the language used for UI labels and future localized features.
                      </p>
                      <select
                        value={language}
                        onChange={(event) => setLanguage(event.target.value as AppLanguage)}
                        className="h-11 rounded-full border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
                      >
                        <option className="bg-slate-950 text-white" value="system">System</option>
                        <option className="bg-slate-950 text-white" value="en">English</option>
                        <option className="bg-slate-950 text-white" value="hi">Hindi</option>
                      </select>
                    </div>
                  </section>
                </div>
              )}

              {tab === "profile" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                      <User size={16} className="text-cyan-300" />
                      Account
                    </div>
                    <div className="space-y-3 text-sm text-slate-300">
                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Name</div>
                        <div className="mt-1 font-medium text-white">{user?.name ?? "Unknown user"}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Email</div>
                        <div className="mt-1 font-medium text-white">{user?.email ?? "Not signed in"}</div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                      <Shield size={16} className="text-fuchsia-300" />
                      Status
                    </div>
                    <div className="grid gap-3 text-sm text-slate-300">
                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Role</div>
                        <div className="mt-1 font-medium text-white">{summary.admin}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Joined</div>
                        <div className="mt-1 font-medium text-white">{user ? formatJoinedDate(user.created_at) : "Unknown"}</div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {tab === "data" && (
                <div className="space-y-4">
                  <section className="grid gap-3 md:grid-cols-3">
                    {[
                      ["Chats", summary.chats],
                      ["Messages", summary.activeMessages],
                      ["Mode", resolvedTheme === "dark" ? "Dark" : "Light"]
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
                        <div className="mt-2 text-xl font-semibold text-white">{value}</div>
                      </div>
                    ))}
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                      <Database size={16} className="text-cyan-300" />
                      Local preferences
                    </div>
                    <p className="text-sm leading-6 text-slate-300">
                      Reset the stored appearance and language preferences or copy a quick diagnostics snapshot.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className="btn-secondary" type="button" onClick={copyDiagnostics}>
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? "Copied" : "Copy diagnostics"}
                      </button>
                      <button className="btn-secondary" type="button" onClick={resetAppearance}>
                        <RotateCcw size={16} />
                        Reset appearance
                      </button>
                    </div>
                  </section>
                </div>
              )}

              {tab === "about" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                      <Info size={16} className="text-cyan-300" />
                      App info
                    </div>
                    <div className="space-y-3 text-sm text-slate-300">
                      <p className="leading-6">
                        Auto-AI keeps chat, document context, and human-mode memory in one workspace.
                      </p>
                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Version</div>
                        <div className="mt-1 font-medium text-white">1.0.0</div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                      <Settings size={16} className="text-fuchsia-300" />
                      Behavior
                    </div>
                    <div className="space-y-3 text-sm text-slate-300">
                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Theme</div>
                        <div className="mt-1 font-medium text-white">{themeLabel(theme)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Language</div>
                        <div className="mt-1 font-medium text-white">{language === "system" ? "System" : language.toUpperCase()}</div>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}