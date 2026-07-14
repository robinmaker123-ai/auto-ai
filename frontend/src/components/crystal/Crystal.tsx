import clsx from "clsx";
import { Component, type ButtonHTMLAttributes, type CSSProperties, type ErrorInfo, type HTMLAttributes, type ReactNode } from "react";
import { useCrystalEffects } from "../../crystal/useCrystalEffects";
import {
  crystalFailureThreshold,
  recordCrystalEffectFailure,
  type CrystalCallState,
  type CrystalOrbState
} from "../../crystal/tokens";

export function CrystalSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { surfaces } = useCrystalEffects();
  return <div className={clsx("crystal-surface", surfaces && "is-crystal-enabled", className)} {...props} />;
}

export function CrystalCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  const { surfaces } = useCrystalEffects();
  return <section className={clsx("crystal-card", surfaces && "is-crystal-enabled", className)} {...props} />;
}

export function CrystalButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { buttonMotion } = useCrystalEffects();
  return (
    <button className={clsx("crystal-button", buttonMotion && "is-crystal-motion", className)} {...props}>
      {children}
    </button>
  );
}

export function CrystalBadge({ className, tone = "default", children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "verified" | "premium" | "admin" }) {
  return <span className={clsx("crystal-badge", `crystal-badge-${tone}`, className)} {...props}>{children}</span>;
}

export function CrystalAvatarRing({ state, className, children }: { state: CrystalCallState; className?: string; children: ReactNode }) {
  const { active, visible } = useCrystalEffects();
  return (
    <span className={clsx("crystal-avatar-ring", active && visible && "is-crystal-enabled", className)} data-state={state}>
      <span className="crystal-avatar-ring-decoration" aria-hidden="true" />
      {children}
    </span>
  );
}

export function CrystalLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  const { active } = useCrystalEffects();
  return (
    <span className={clsx("crystal-loader", active && "is-crystal-enabled", className)} role="status" aria-label={label}>
      <span aria-hidden="true" />
    </span>
  );
}

export function CrystalErrorFallback({ label = "Visual effect unavailable", className }: { label?: string; className?: string }) {
  return (
    <span className={clsx("crystal-error-fallback", className)} role="img" aria-label={label}>
      <span aria-hidden="true" />
    </span>
  );
}

type CrystalErrorBoundaryState = { failed: boolean };

export class CrystalErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, CrystalErrorBoundaryState> {
  state: CrystalErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): CrystalErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const failures = recordCrystalEffectFailure();
    console.warn("[Auto-AI Crystal] Optional visual effect failed.", { name: error.name, componentStack: info.componentStack });
    window.dispatchEvent(new CustomEvent("auto-ai-crystal-failure", { detail: { failures } }));
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? <CrystalErrorFallback />;
    return this.props.children;
  }
}

export function CrystalAiOrb({ state = "idle", size = "md", className, label = "Auto-AI status" }: { state?: CrystalOrbState; size?: "sm" | "md" | "lg"; className?: string; label?: string }) {
  const effects = useCrystalEffects();
  const enabled = effects.orb && effects.visible;
  return (
    <span
      className={clsx("crystal-ai-orb", `crystal-ai-orb-${size}`, enabled ? "is-crystal-enabled" : "is-static", className)}
      data-state={state}
      role="img"
      aria-label={`${label}: ${state}`}
    >
      <span className="crystal-orb-core" aria-hidden="true" />
      <span className="crystal-orb-facet facet-a" aria-hidden="true" />
      <span className="crystal-orb-facet facet-b" aria-hidden="true" />
      <span className="crystal-orb-highlight" aria-hidden="true" />
    </span>
  );
}

export function CrystalVoiceVisualizer({ active, state = "listening", className }: { active: boolean; state?: "listening" | "speaking"; className?: string }) {
  const effects = useCrystalEffects();
  const moving = active && effects.voiceVisualizer && effects.visible;
  return (
    <span
      className={clsx("crystal-voice-visualizer", moving ? "is-active" : "is-static", className)}
      data-state={state}
      role="img"
      aria-label={active ? `${state} audio activity` : "Voice inactive"}
    >
      {[0, 1, 2, 3, 4].map((bar) => <span key={bar} style={{ "--crystal-bar": bar } as CSSProperties} aria-hidden="true" />)}
    </span>
  );
}

export const CRYSTAL_FAILURE_THRESHOLD = crystalFailureThreshold;
