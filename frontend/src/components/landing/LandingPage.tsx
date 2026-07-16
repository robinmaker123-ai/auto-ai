import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  Check,
  Command,
  Copy,
  Download,
  Eye,
  FileText,
  Layers3,
  LockKeyhole,
  Menu,
  MessageSquare,
  Network,
  PhoneCall,
  QrCode,
  Search,
  ShieldCheck,
  ScreenShare,
  Smartphone,
  Sparkles,
  X,
  Zap,
  Wifi,
  WifiOff
} from "lucide-react";
import { api, resolveApkDownloadUrl } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import type { ApkRelease, ApkStats, BillingPlan } from "../../types";
import { LogoIcon } from "../brand/LogoIcon";
import { ThemeToggleButton } from "../layout/ThemeToggleButton";
import {
  PrismBadge,
  PrismButton,
  PrismCard,
  PrismDialog,
  PrismEmptyState,
  PrismIconButton,
  PrismInput,
  PrismNavigation,
  PrismReveal,
  PrismStatusChip,
  PrismSurface,
  PrismTabs,
  PrismTooltip
} from "../prism/Prism";
import { usePublishedFaqs, usePublishedGlobals, usePublishedPage } from "../../hooks/useCmsContent";
import { PublishedContentBlocks } from "../common/PublishedContentBlocks";
import { useScreenShare } from "../../features/screenShare/useScreenShare";

const LazyQRCode = lazy(async () => {
  const module = await import("qrcode.react");
  return { default: module.QRCodeSVG };
});

type PreviewMode = "chat" | "research" | "vision";
type CommandItem = { label: string; detail: string; to?: string; section?: string };
type DemoMessage = { id: string; role: "user" | "assistant"; text: string };
type DemoThreads = Record<PreviewMode, DemoMessage[]>;

const DEMO_CHAT_LIMIT = 20;
const DEMO_SESSION_STORAGE_KEY = "auto-ai-prism-demo-session";

const previewModes: ReadonlyArray<{ id: PreviewMode; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "research", label: "Research" },
  { id: "vision", label: "Vision" }
];

const previewContent: Record<PreviewMode, { prompt: string; answer: string }> = {
  chat: {
    prompt: "Turn these project notes into a clear launch plan.",
    answer: "I mapped the decisions, grouped the risks, and prepared a focused sequence your team can start today."
  },
  research: {
    prompt: "Compare the strongest evidence across current sources.",
    answer: "I checked the claims against multiple sources and separated verified findings from open questions."
  },
  vision: {
    prompt: "Review this interface and identify usability issues.",
    answer: "The main actions are clear. I found two mobile spacing issues and one low-contrast state to correct."
  }
};

function createInitialDemoThreads(): DemoThreads {
  return {
    chat: [
      { id: "chat-user-initial", role: "user", text: previewContent.chat.prompt },
      { id: "chat-ai-initial", role: "assistant", text: previewContent.chat.answer }
    ],
    research: [
      { id: "research-user-initial", role: "user", text: previewContent.research.prompt },
      { id: "research-ai-initial", role: "assistant", text: previewContent.research.answer }
    ],
    vision: [
      { id: "vision-user-initial", role: "user", text: previewContent.vision.prompt },
      { id: "vision-ai-initial", role: "assistant", text: previewContent.vision.answer }
    ]
  };
}

function readOrCreateDemoSessionId() {
  try {
    const stored = localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (stored && /^[A-Za-z0-9_-]{16,80}$/.test(stored)) return stored;
    const next = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEMO_SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  }
}

const bentoFeatures: Array<{
  title: string;
  body: string;
  icon: ReactNode;
  accent: string;
  size: "wide" | "tall" | "standard";
  signal: string;
}> = [
  {
    title: "AI Chat",
    body: "A fast, context-aware conversation workspace for ideas, documents, decisions, and follow-up work.",
    icon: <MessageSquare size={20} />,
    accent: "cyan",
    size: "wide",
    signal: "Streaming"
  },
  {
    title: "Voice Mode",
    body: "Speak naturally, listen to clear answers, and stay in the flow without reaching for the keyboard.",
    icon: <AudioLines size={20} />,
    accent: "pink",
    size: "tall",
    signal: "Listening"
  },
  {
    title: "Vision",
    body: "Bring screenshots and images into the same conversation for precise visual understanding.",
    icon: <Eye size={20} />,
    accent: "blue",
    size: "standard",
    signal: "Visual context"
  },
  {
    title: "Screen Sharing",
    body: "Share with a secure 8-digit code and work across phone and laptop without installing viewer software.",
    icon: <Layers3 size={20} />,
    accent: "violet",
    size: "wide",
    signal: "WebRTC"
  },
  {
    title: "Audio & Video Calls",
    body: "Move from messages to a direct conversation with clear connection and call states.",
    icon: <PhoneCall size={20} />,
    accent: "pink",
    size: "standard",
    signal: "Connected"
  },
  {
    title: "Deep Research",
    body: "Build source-grounded answers while keeping evidence and uncertainty visible.",
    icon: <Search size={20} />,
    accent: "cyan",
    size: "standard",
    signal: "Source aware"
  },
  {
    title: "Multi-model Routing",
    body: "Match each task to the right intelligence path while keeping one consistent workspace.",
    icon: <Network size={20} />,
    accent: "blue",
    size: "wide",
    signal: "Adaptive"
  },
  {
    title: "Secure Conversations",
    body: "Private sessions, visible permissions, and user-controlled data keep every interaction intentional.",
    icon: <ShieldCheck size={20} />,
    accent: "violet",
    size: "standard",
    signal: "Protected"
  }
];

const capabilities = ["Streaming chat", "Voice input", "Image analysis", "Memory panel", "Search mode", "File context", "Screen sharing", "Secure calls"];

const testimonials = [
  "The workspace stays clear even when the project gets complicated.",
  "Research, uploads, and conversation finally feel like one continuous thought.",
  "It is quick enough for daily work and calm enough for long sessions."
];

const fallbackFaqs = [
  ["Does Auto-AI remember me?", "Yes. You can inspect, add, and delete user-owned memories from the app."],
  ["Can I chat with files?", "Yes. Attach PDF, DOCX, TXT, or images and Auto-AI brings their context into the thread."],
  ["Can I use Auto-AI on mobile?", "Yes. The Android app uses the same account, chats, calls, settings, and screen-sharing system."]
];

function money(amountPaise: number, currency = "INR") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amountPaise / 100);
}

function formatDate(value?: string | null) {
  if (!value) return "Pending release";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function LandingPage() {
  const { user } = useAuth();
  const screenShare = useScreenShare();
  const online = useOnlineStatus();
  const cmsPage = usePublishedPage("home");
  const globalContent = usePublishedGlobals();
  const publishedFaqs = usePublishedFaqs();
  const [latestApk, setLatestApk] = useState<ApkRelease | null>(null);
  const [apkStats, setApkStats] = useState<ApkStats | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("chat");
  const [demoThreads, setDemoThreads] = useState<DemoThreads>(createInitialDemoThreads);
  const [demoDraft, setDemoDraft] = useState("");
  const [demoTurns, setDemoTurns] = useState(0);
  const [demoLimit, setDemoLimit] = useState(DEMO_CHAT_LIMIT);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [demoModel, setDemoModel] = useState("Amazon Bedrock");
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoSessionId] = useState(readOrCreateDemoSessionId);
  const [pendingDemoMode, setPendingDemoMode] = useState<PreviewMode | null>(null);
  const [copied, setCopied] = useState(false);
  const demoMessagesRef = useRef<HTMLDivElement>(null);
  const qrUrl = resolveApkDownloadUrl();
  const cmsBlocks = cmsPage?.blocks ?? [];
  const featureHeading = String(cmsBlocks.find((block) => block.block_type === "heading")?.content.text ?? "One intelligence layer. Every way you work.");
  const finalCta = cmsBlocks.find((block) => block.block_type === "call_to_action");
  const extraBlocks = cmsBlocks.filter((block) => !["heading", "feature_grid", "call_to_action"].includes(block.block_type));
  const visibleFaqs = publishedFaqs?.length ? publishedFaqs.map((item) => [item.question, item.answer]) : fallbackFaqs;
  const currentDemoMessages = demoThreads[previewMode];
  const demoRemaining = Math.max(0, demoLimit - demoTurns);

  const navLinks = useMemo(() => [
    { id: "features", label: globalContent?.["header.features"] || "Features" },
    { id: "android", label: globalContent?.["header.android"] || "Android" },
    { id: "pricing", label: globalContent?.["header.pricing"] || "Pricing" },
    { id: "faq", label: globalContent?.["header.faq"] || "FAQ" }
  ], [globalContent]);

  const commandItems = useMemo<CommandItem[]>(() => [
    { label: "Start a conversation", detail: "Open the Auto-AI chat workspace", to: user ? "/chat" : "/register" },
    { label: "Explore features", detail: "See chat, voice, vision, calls, and sharing", section: "features" },
    { label: "Download Android app", detail: "View the current APK release", to: "/download" },
    { label: "Compare plans", detail: "Review available Auto-AI plans", to: "/pricing" },
    { label: "Sign in", detail: "Continue with your Auto-AI account", to: "/login" }
  ].filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(commandQuery.trim().toLowerCase())), [commandQuery, user]);

  const closeCommand = useCallback(() => {
    setCommandOpen(false);
    setCommandQuery("");
  }, []);

  const scrollToSection = useCallback((sectionId: string) => {
    setMobileMenuOpen(false);
    closeCommand();
    const behavior = document.documentElement.dataset.autoAiCrystal === "full" ? "smooth" : "auto";
    document.getElementById(sectionId)?.scrollIntoView({ behavior, block: "start" });
  }, [closeCommand]);

  useEffect(() => {
    let active = true;
    Promise.all([api.latestApk(), api.apkStats()])
      .then(([release, stats]) => {
        if (!active) return;
        setLatestApk(release);
        setApkStats(stats);
      })
      .catch(() => {
        if (active) setLatestApk(null);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const container = demoMessagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [currentDemoMessages.length, demoError, pendingDemoMode, previewMode]);

  useEffect(() => {
    let active = true;
    api.demoChatConfig()
      .then((config) => {
        if (!active) return;
        setDemoEnabled(config.enabled);
        setDemoLimit(config.limit);
        setDemoModel(config.model);
      })
      .catch(() => {
        if (active) setDemoError("Bedrock demo configuration is unavailable.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    api.paymentPlans()
      .then((nextPlans) => {
        if (active) setPlans(nextPlans.filter((plan) => ["free", "pro", "premium", "ultra"].includes(plan.id)));
      })
      .catch(() => {
        if (active) setPlans([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const sections = ["overview", "features", "android", "pricing", "faq"]
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!("IntersectionObserver" in window) || !sections.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveSection(visible.target.id);
    }, { rootMargin: "-24% 0px -60%", threshold: [0.05, 0.25, 0.5] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function downloadLatestApk() {
    let release = latestApk;
    if (release) {
      try {
        const countedRelease = await api.countApkDownload({ id: release.id });
        release = countedRelease;
        setLatestApk(countedRelease);
        setApkStats((current) => current && {
          ...current,
          latest: countedRelease,
          total_downloads: current.total_downloads + 1,
          downloads_by_version: {
            ...current.downloads_by_version,
            [countedRelease.version_name]: countedRelease.download_count
          }
        });
      } catch {
        release = latestApk;
      }
    }
    window.location.href = resolveApkDownloadUrl(release, Boolean(release));
  }

  async function copyWebsiteLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function sendDemoMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = demoDraft.trim();
    if (!message || !demoEnabled || demoRemaining <= 0 || pendingDemoMode) return;

    const mode = previewMode;
    const userMessage: DemoMessage = { id: `${mode}-user-${Date.now()}`, role: "user", text: message };
    setDemoThreads((current) => ({ ...current, [mode]: [...current[mode], userMessage] }));
    setDemoDraft("");
    setDemoError(null);
    setPendingDemoMode(mode);

    try {
      const result = await api.demoChat({
        session_id: demoSessionId,
        message,
        mode,
        history: currentDemoMessages.slice(-10).map((item) => ({ role: item.role, content: item.text }))
      });
      const assistantMessage: DemoMessage = {
        id: `${mode}-assistant-${Date.now()}`,
        role: "assistant",
        text: result.content
      };
      setDemoThreads((current) => ({ ...current, [mode]: [...current[mode], assistantMessage] }));
      setDemoTurns(result.messages_used);
      setDemoLimit(result.messages_used + result.remaining);
      setDemoModel(result.model);
    } catch (error) {
      setDemoThreads((current) => ({
        ...current,
        [mode]: current[mode].filter((item) => item.id !== userMessage.id)
      }));
      setDemoDraft(message);
      setDemoError(error instanceof Error ? error.message : "Bedrock could not answer. Please try again.");
    } finally {
      setPendingDemoMode(null);
    }
  }

  return (
    <div className="prism-landing route-transition-stage">
      <header className="prism-landing-nav">
        <Link className="prism-brand" to="/" aria-label="Auto-AI home">
          <span className="prism-brand-icon"><LogoIcon /></span>
          <span>Auto-AI</span>
          <small>Prism Intelligence</small>
        </Link>

        <PrismNavigation aria-label="Primary navigation">
          {navLinks.map((item) => (
            <button key={item.id} type="button" onClick={() => scrollToSection(item.id)} aria-current={activeSection === item.id ? "location" : undefined}>
              {item.label}
            </button>
          ))}
        </PrismNavigation>

        <div className="prism-nav-actions">
          <PrismStatusChip
            className="prism-nav-status"
            tone={online ? "success" : "offline"}
            icon={online ? <Wifi size={13} /> : <WifiOff size={13} />}
          >
            {online ? "Online" : "Offline"}
          </PrismStatusChip>
          <PrismTooltip label="Quick navigation">
            <PrismIconButton type="button" onClick={() => setCommandOpen(true)} aria-label="Open quick navigation">
              <Search size={17} />
              <span className="prism-command-key">Ctrl K</span>
            </PrismIconButton>
          </PrismTooltip>
          <button
            className="prism-button prism-screen-share-nav"
            type="button"
            onClick={screenShare.requestInviteShare}
          >
            <ScreenShare size={16} />
            <span>Screen Share</span>
          </button>
          <Link className="prism-button prism-nav-cta" to={user ? "/chat" : "/login"}>
            {user ? "Open app" : globalContent?.["header.sign_in"] || "Sign in"}
          </Link>
          <ThemeToggleButton />
          <PrismIconButton
            className="prism-mobile-menu-button"
            type="button"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((current) => !current)}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </PrismIconButton>
        </div>

        {mobileMenuOpen && (
          <PrismNavigation className="prism-mobile-menu" aria-label="Mobile navigation">
            {navLinks.map((item) => (
              <button key={item.id} type="button" onClick={() => scrollToSection(item.id)}>{item.label}</button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                screenShare.requestInviteShare();
              }}
            >
              <ScreenShare size={16} /> Screen Share
            </button>
            <Link to={user ? "/chat" : "/login"} onClick={() => setMobileMenuOpen(false)}>
              {user ? "Open app" : "Sign in"}
            </Link>
          </PrismNavigation>
        )}
      </header>

      <main>
        <section id="overview" className="prism-hero" aria-labelledby="prism-hero-title">
          <div className="prism-constellation" aria-hidden="true" />
          <div className="prism-hero-copy">
            <PrismBadge><Sparkles size={14} /> AutoAI Prism Intelligence</PrismBadge>
            <h1 id="prism-hero-title">
              <span>{cmsPage?.hero_heading || "Auto-AI"}</span>
              Intelligence that stays in your flow.
            </h1>
            <p>
              {cmsPage?.hero_description || "Chat, speak, research, share, and build with one adaptive AI workspace designed to keep context clear."}
            </p>
            <div className="prism-hero-actions">
              <Link className="prism-button prism-button-primary" to={user ? "/chat" : cmsPage?.buttons?.[0]?.url || "/register"}>
                Start Chatting <ArrowRight size={17} />
              </Link>
              <button className="prism-button prism-button-secondary" type="button" onClick={() => scrollToSection("features")}>
                Explore Features
              </button>
            </div>
            <div className="prism-trust-row" aria-label="Product assurances">
              <span><ShieldCheck size={14} /> Private by design</span>
              <span><Zap size={14} /> Responsive streaming</span>
              <span><LockKeyhole size={14} /> User-controlled sharing</span>
            </div>
          </div>

          <PrismSurface className="prism-product-preview" aria-label="Auto-AI workspace preview">
            <div className="prism-preview-topbar">
              <span className="prism-preview-brand"><LogoIcon /> Auto-AI</span>
              <div className="prism-preview-statuses">
                <PrismStatusChip tone="active">{demoRemaining} demo chats left</PrismStatusChip>
                <PrismStatusChip className="prism-bedrock-chip" tone="success" icon={<span className="prism-live-dot" />}>
                  Bedrock <span>{demoModel}</span>
                </PrismStatusChip>
              </div>
            </div>
            <PrismTabs label="Preview mode" items={previewModes} active={previewMode} onChange={setPreviewMode} />
            <div className="prism-preview-workspace">
              <div className="prism-preview-rail" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
              <div className="prism-preview-thread">
                <div className="prism-preview-context">
                  <BrainCircuit size={16} />
                  <span>Bedrock context</span>
                  <small>No chat stored</small>
                </div>
                <div className="prism-preview-messages" ref={demoMessagesRef} aria-live="polite">
                  {currentDemoMessages.map((message) => (
                    <p key={message.id} className={`prism-preview-message is-${message.role === "assistant" ? "ai" : "user"}`}>
                      {message.role === "assistant" && <span className="prism-answer-mark"><Sparkles size={14} /></span>}
                      {message.text}
                    </p>
                  ))}
                  {pendingDemoMode === previewMode && (
                    <div className="prism-demo-thinking" role="status" aria-label="Auto-AI demo is thinking"><span /><span /><span /></div>
                  )}
                  {demoError && <div className="prism-demo-error" role="alert">{demoError}</div>}
                </div>
                <form className="prism-preview-composer" onSubmit={sendDemoMessage}>
                  <FileText size={15} />
                  <input
                    aria-label="Demo message"
                    value={demoDraft}
                    maxLength={300}
                    disabled={!demoEnabled || demoRemaining <= 0 || Boolean(pendingDemoMode)}
                    placeholder={!demoEnabled ? "Bedrock demo unavailable" : demoRemaining > 0 ? "Message the Bedrock demo" : "Demo limit reached"}
                    onChange={(event) => setDemoDraft(event.target.value)}
                  />
                  <button type="submit" disabled={!demoDraft.trim() || !demoEnabled || demoRemaining <= 0 || Boolean(pendingDemoMode)} aria-label="Send demo message">
                    <ArrowRight size={15} />
                  </button>
                </form>
              </div>
              <div className="prism-preview-intelligence" aria-hidden="true">
                <div className="prism-crystal-object">
                  <span className="facet-one" />
                  <span className="facet-two" />
                </div>
                <span>Bedrock model</span>
                <small>{demoModel}</small>
              </div>
            </div>
          </PrismSurface>
        </section>

        <div className="prism-proof-band" aria-label="Auto-AI status">
          <span><strong>8</strong> connected capabilities</span>
          <span><strong>1</strong> continuous workspace</span>
          <span><strong>0</strong> silent screen capture</span>
          <PrismStatusChip tone={online ? "active" : "offline"}>{online ? "Systems ready" : "Connection unavailable"}</PrismStatusChip>
        </div>

        {extraBlocks.length > 0 && (
          <PrismReveal className="prism-public-section prism-cms-section">
            <PublishedContentBlocks blocks={extraBlocks} />
          </PrismReveal>
        )}

        <section id="features" className="prism-public-section prism-feature-section" aria-labelledby="features-heading">
          <PrismReveal>
            <div className="prism-section-heading">
              <PrismBadge><BrainCircuit size={14} /> Connected intelligence</PrismBadge>
              <h2 id="features-heading">{featureHeading}</h2>
              <p>Each capability is useful on its own. Together, they keep context moving without forcing you to rebuild it.</p>
            </div>
            <div className="prism-bento-grid">
              {bentoFeatures.map((feature) => (
                <PrismCard
                  key={feature.title}
                  className={`prism-feature-card is-${feature.size} accent-${feature.accent}`}
                >
                  <div className="prism-feature-card-head">
                    <span className="prism-feature-icon">{feature.icon}</span>
                    <PrismStatusChip tone="idle">{feature.signal}</PrismStatusChip>
                  </div>
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </div>
                  <span className="prism-card-edge" aria-hidden="true" />
                </PrismCard>
              ))}
            </div>
          </PrismReveal>
        </section>

        <section className="prism-public-section prism-loop-section" aria-labelledby="loop-heading">
          <PrismReveal>
            <PrismSurface className="prism-loop-band">
              <div>
                <PrismBadge><Network size={14} /> One workspace</PrismBadge>
                <h2 id="loop-heading">From first thought to finished answer.</h2>
                <p>Keep the conversation, supporting files, voice, visual context, and next action in one readable place.</p>
              </div>
              <div className="prism-capability-list">
                {capabilities.map((capability) => <span key={capability}><Check size={14} /> {capability}</span>)}
              </div>
            </PrismSurface>
          </PrismReveal>
        </section>

        <section id="android" className="prism-public-section" aria-labelledby="android-heading">
          <PrismReveal>
            <div className="prism-android-layout">
              <div className="prism-android-copy">
                <PrismBadge><Smartphone size={14} /> Android application</PrismBadge>
                <h2 id="android-heading">Your Auto-AI workspace, ready to move.</h2>
                <p>Use the same account, chat history, calls, screen sharing, uploads, settings, and AI context from your phone.</p>
                <div className="prism-release-grid">
                  <span><small>Latest</small>{latestApk?.version_name ?? "Checking"}</span>
                  <span><small>Released</small>{formatDate(latestApk?.released_at ?? latestApk?.release_date)}</span>
                  <span><small>Downloads</small>{(apkStats?.total_downloads ?? latestApk?.download_count ?? 0).toLocaleString()}</span>
                </div>
                {latestApk?.changelog && <p className="prism-changelog">{latestApk.changelog}</p>}
                <div className="prism-android-actions">
                  <PrismButton className="prism-button-primary" type="button" onClick={downloadLatestApk}>
                    <Download size={17} /> Download APK
                  </PrismButton>
                  <Link className="prism-button prism-button-secondary" to="/download">App details</Link>
                </div>
              </div>
              <div className="prism-device-stage">
                <div className="prism-phone" aria-label="Auto-AI Android preview">
                  <div className="prism-phone-screen">
                    <span className="prism-phone-status">9:41 <Wifi size={12} /></span>
                    <span className="prism-phone-brand"><LogoIcon /> Auto-AI</span>
                    <span className="prism-phone-copy is-user">Share the latest screen.</span>
                    <span className="prism-phone-copy is-ai">Your secure code is ready.</span>
                    <span className="prism-phone-share"><Layers3 size={18} /> 8-digit screen share</span>
                  </div>
                </div>
                <div className="prism-qr-panel">
                  <Suspense fallback={<QrCode size={88} aria-label="QR code loading" />}>
                    <LazyQRCode value={qrUrl} size={104} bgColor="transparent" fgColor="#f7fbff" />
                  </Suspense>
                  <span>Scan for Android</span>
                </div>
              </div>
            </div>
          </PrismReveal>
        </section>

        <section className="prism-public-section" aria-labelledby="trust-heading">
          <PrismReveal>
            <div className="prism-section-heading prism-section-heading-left">
              <PrismBadge><Sparkles size={14} /> Built for real work</PrismBadge>
              <h2 id="trust-heading">Clear enough for every day. Capable enough for the hard days.</h2>
            </div>
            <div className="prism-testimonial-grid">
              {testimonials.map((quote) => (
                <PrismCard key={quote} className="prism-quote-card">
                  <blockquote>{quote}</blockquote>
                  <footer><span>Verified user</span><PrismStatusChip tone="success">Active workspace</PrismStatusChip></footer>
                </PrismCard>
              ))}
            </div>
          </PrismReveal>
        </section>

        <section id="pricing" className="prism-public-section" aria-labelledby="pricing-heading">
          <PrismReveal>
            <div className="prism-section-heading">
              <PrismBadge><Zap size={14} /> Flexible plans</PrismBadge>
              <h2 id="pricing-heading">Start focused. Scale when the work grows.</h2>
              <p>Choose the workspace capacity that fits today and move up when you need more.</p>
            </div>
            {plans.length ? (
              <div className="prism-pricing-grid">
                {plans.map((plan) => (
                  <PrismCard key={plan.id} className={plan.id === "premium" ? "prism-plan-card is-featured" : "prism-plan-card"}>
                    <div className="prism-plan-heading">
                      <h3>{plan.label}</h3>
                      {plan.id === "premium" && <PrismBadge>Recommended</PrismBadge>}
                    </div>
                    <strong>{money(plan.price_paise, plan.currency)}</strong>
                    <span>{plan.token_quota.toLocaleString()} tokens / month</span>
                    <Link className={plan.id === "premium" ? "prism-button prism-button-primary" : "prism-button prism-button-secondary"} to="/pricing">
                      Choose {plan.label}
                    </Link>
                  </PrismCard>
                ))}
              </div>
            ) : (
              <PrismEmptyState icon={<Zap size={22} />} title="Plans are syncing" description="Current plan details will appear when the pricing service is available." />
            )}
          </PrismReveal>
        </section>

        <section className="prism-public-section prism-cta-section" aria-labelledby="cta-heading">
          <PrismReveal>
            <div className="prism-final-cta">
              <div>
                <PrismBadge><LogoIcon /> Auto-AI</PrismBadge>
                <h2 id="cta-heading">{String(finalCta?.content.heading ?? "Bring the whole workspace into one conversation.")}</h2>
              </div>
              <div className="prism-final-actions">
                <Link className="prism-button prism-button-primary" to={user ? "/chat" : "/register"}>
                  {user ? "Open app" : String(finalCta?.content.button_text ?? globalContent?.["cta.default"] ?? "Create account")}
                  <ArrowRight size={17} />
                </Link>
                <PrismButton className={copied ? "prism-button-success" : "prism-button-secondary"} type="button" onClick={copyWebsiteLink}>
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                  {copied ? "Link copied" : "Copy link"}
                </PrismButton>
              </div>
            </div>
          </PrismReveal>
        </section>

        <section id="faq" className="prism-public-section prism-faq-section" aria-labelledby="faq-heading">
          <PrismReveal>
            <div className="prism-section-heading">
              <PrismBadge><MessageSquare size={14} /> FAQ</PrismBadge>
              <h2 id="faq-heading">A few useful answers before you begin.</h2>
            </div>
            <div className="prism-faq-list">
              {visibleFaqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </PrismReveal>
        </section>
      </main>

      <footer className="prism-footer">
        <Link className="prism-brand" to="/"><span className="prism-brand-icon"><LogoIcon /></span><span>Auto-AI</span></Link>
        <p>{globalContent?.["footer.description"] || "A connected AI workspace for thoughtful, secure, human-feeling work."}</p>
        <PrismStatusChip tone={online ? "success" : "offline"} icon={online ? <Wifi size={13} /> : <WifiOff size={13} />}>
          {online ? "Connected" : "Offline"}
        </PrismStatusChip>
      </footer>

      <PrismDialog
        open={commandOpen}
        title="Quick navigation"
        description="Find a page or action in Auto-AI."
        onClose={closeCommand}
      >
        <PrismInput
          autoFocus
          label="Search"
          placeholder="Search Auto-AI"
          value={commandQuery}
          onChange={(event) => setCommandQuery(event.target.value)}
        />
        <div className="prism-command-results">
          {commandItems.map((item) => item.to ? (
            <Link key={item.label} to={item.to} onClick={closeCommand}>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight size={16} />
            </Link>
          ) : (
            <button key={item.label} type="button" onClick={() => item.section && scrollToSection(item.section)}>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight size={16} />
            </button>
          ))}
          {!commandItems.length && <PrismEmptyState icon={<Command size={20} />} title="No match" description="Try a shorter search term." />}
        </div>
      </PrismDialog>
    </div>
  );
}
