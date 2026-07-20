import { useEffect, type RefObject } from "react";
import { KINETIC_REVEAL_COMPLETE_MS, isSimpleKineticDevice } from "../motion/kineticRevealConfig";

const REVEAL_SELECTOR = "[data-kinetic-reveal]";
const REVEAL_STATE_ATTRIBUTE = "data-reveal-state";

type RevealState = "pending" | "animating" | "revealed";

type NavigatorPerformanceProfile = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

export type AutoAiMotionDebugState = {
  mounted: boolean;
  cssLoaded: boolean;
  readyClass: boolean;
  reducedMotion: boolean;
  scrollRoot: string;
  observedCount: number;
  intersectedCount: number;
  animatingCount: number;
  revealedCount: number;
  lastError: string | null;
};

declare global {
  interface Window {
    __AUTOAI_MOTION_DEBUG__?: AutoAiMotionDebugState;
  }
}

function setRevealState(element: HTMLElement, state: RevealState) {
  element.setAttribute(REVEAL_STATE_ATTRIBUTE, state);
  if (state === "pending") {
    element.classList.remove("is-revealed", "is-kinetic-complete");
    return;
  }
  element.classList.add("is-revealed");
  if (state === "revealed") element.classList.add("is-kinetic-complete");
  else element.classList.remove("is-kinetic-complete");
}

function revealImmediately(element: HTMLElement) {
  setRevealState(element, "revealed");
}

function revealAll(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(revealImmediately);
}

function isBackForwardRestore() {
  try {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return navigation?.type === "back_forward";
  } catch {
    return false;
  }
}

function findScrollContainer(root: HTMLElement): HTMLElement | Document {
  try {
    let candidate = root.parentElement;
    while (candidate) {
      const overflowY = window.getComputedStyle(candidate).overflowY;
      const scrollableOverflow = overflowY === "auto" || overflowY === "scroll";
      if (scrollableOverflow || candidate.id === "root") return candidate;
      candidate = candidate.parentElement;
    }
  } catch {
    // Fall through to the document without blocking progressive enhancement.
  }
  return document;
}

function scrollBounds(target: HTMLElement | Document) {
  if (!(target instanceof HTMLElement)) return { top: 0, bottom: window.innerHeight };
  const bounds = target.getBoundingClientRect();
  return { top: bounds.top, bottom: bounds.bottom };
}

function scrollEventTargets(root: HTMLElement, primary: HTMLElement | Document) {
  const targets = new Set<EventTarget>([primary, document, window]);
  let candidate = root.parentElement;
  while (candidate) {
    targets.add(candidate);
    candidate = candidate.parentElement;
  }
  return [...targets];
}

function isOutsideReplayZone(rect: DOMRect, bounds: { top: number; bottom: number }) {
  const buffer = Math.max(48, (bounds.bottom - bounds.top) * 0.12);
  return rect.bottom < bounds.top - buffer || rect.top > bounds.bottom + buffer;
}

function describeScrollRoot(target: HTMLElement | Document) {
  if (!(target instanceof HTMLElement)) return "document";
  if (target.id) return `#${target.id}`;
  const className = typeof target.className === "string" ? target.className.trim().split(/\s+/).filter(Boolean)[0] : "";
  return `${target.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
}

function kineticCssLoaded(target: HTMLElement) {
  try {
    const styles = window.getComputedStyle(target);
    if (typeof styles.getPropertyValue !== "function") return true;
    return styles.getPropertyValue("--auto-ai-kinetic-css").trim() === "1";
  } catch {
    return false;
  }
}

function isLocalDevelopmentHost(hostname: string | undefined) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function setupKineticReveal(root: HTMLElement, { disabled = false }: { disabled?: boolean } = {}) {
  const debugEnabled = import.meta.env.DEV && new URLSearchParams(window.location?.search ?? "").get("motionDebug") === "1";
  const localMotionOverride = import.meta.env.DEV && isLocalDevelopmentHost(window.location?.hostname);
  const forceMotion = debugEnabled || localMotionOverride;
  const html = document.documentElement;
  const previousForceMotion = html?.getAttribute("data-auto-ai-force-motion");
  if (forceMotion) {
    html?.setAttribute("data-auto-ai-force-motion", "true");
  }
  if (debugEnabled) {
    root.setAttribute("data-auto-ai-motion-debug", "true");
  }

  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reducedMotion = (motionQuery?.matches ?? false) && !forceMotion;
  const supported = "IntersectionObserver" in window && "MutationObserver" in window;
  const debugState: AutoAiMotionDebugState = {
    mounted: true,
    cssLoaded: false,
    readyClass: false,
    reducedMotion,
    scrollRoot: "unresolved",
    observedCount: 0,
    intersectedCount: 0,
    animatingCount: 0,
    revealedCount: 0,
    lastError: null
  };

  const updateDebug = (label: string, patch: Partial<AutoAiMotionDebugState> = {}) => {
    if (!debugEnabled) return;
    const changed = Object.entries(patch).some(([key, value]) => debugState[key as keyof AutoAiMotionDebugState] !== value);
    Object.assign(debugState, patch);
    window.__AUTOAI_MOTION_DEBUG__ = { ...debugState };
    if (changed || label === "mounted") console.info(`[Auto-AI Motion] ${label}`, window.__AUTOAI_MOTION_DEBUG__);
  };

  const clearDebug = () => {
    if (debugEnabled) {
      root.removeAttribute("data-auto-ai-motion-debug");
      if (window.__AUTOAI_MOTION_DEBUG__) delete window.__AUTOAI_MOTION_DEBUG__;
    }
    if (forceMotion) {
      if (previousForceMotion === null) html?.removeAttribute("data-auto-ai-force-motion");
      else html?.setAttribute("data-auto-ai-force-motion", previousForceMotion);
    }
  };

  updateDebug("mounted");

  if (disabled || reducedMotion || !supported || isBackForwardRestore()) {
    root.classList.remove("kinetic-motion-ready", "kinetic-motion-simple");
    revealAll(root);
    updateDebug("disabled", {
      mounted: true,
      reducedMotion,
      revealedCount: root.querySelectorAll(REVEAL_SELECTOR).length,
      lastError: !supported ? "IntersectionObserver or MutationObserver unavailable" : null
    });
    return () => clearDebug();
  }

  const registeredTargets = new Set<HTMLElement>();
  const activeTargets = new Set<HTMLElement>();
  const completionTimers = new Map<HTMLElement, number>();
  const completionHandlers = new Map<HTMLElement, EventListener>();
  const scrollContainer = findScrollContainer(root);
  const scrollTargets = scrollEventTargets(root, scrollContainer);
  const observerThreshold = window.innerWidth <= 640 ? 0.05 : 0.1;
  const observerRootMargin = window.innerWidth <= 640 ? "0px 0px -4% 0px" : "0px 0px -8% 0px";
  let disposed = false;
  let failedOpen = false;
  let mutationObserver: MutationObserver | null = null;
  let observer: IntersectionObserver | null = null;
  let intersectionCount = 0;
  let scrollFallbackTimer: number | undefined;
  let scrollSettleTimer: number | undefined;

  updateDebug("scroll-root", { scrollRoot: describeScrollRoot(scrollContainer) });

  const syncDebugCounts = (label: string, patch: Partial<AutoAiMotionDebugState> = {}) => {
    updateDebug(label, {
      observedCount: registeredTargets.size,
      intersectedCount: intersectionCount,
      animatingCount: [...registeredTargets].filter((element) => element.getAttribute(REVEAL_STATE_ATTRIBUTE) === "animating").length,
      revealedCount: [...registeredTargets].filter((element) => element.getAttribute(REVEAL_STATE_ATTRIBUTE) === "revealed").length,
      ...patch
    });
  };

  const clearCompletion = (element: HTMLElement) => {
    const timer = completionTimers.get(element);
    if (timer !== undefined) window.clearTimeout(timer);
    completionTimers.delete(element);
    const handler = completionHandlers.get(element);
    if (handler) {
      element.removeEventListener("animationend", handler);
      element.removeEventListener("animationcancel", handler);
    }
    completionHandlers.delete(element);
  };

  const triggerPrismPortal = (element: HTMLElement) => {
    const prismPortal = root.querySelector<HTMLElement>(":scope > .kinetic-prism-portal");
    if (!prismPortal || !element.matches("h1, h2, h3")) return;
    const rect = element.getBoundingClientRect();
    prismPortal.style.setProperty("--prism-portal-y", `${Math.max(80, Math.min(window.innerHeight - 80, rect.top + rect.height / 2))}px`);
    prismPortal.classList.remove("is-active");
    void prismPortal.offsetWidth;
    prismPortal.classList.add("is-active");
  };

  const completeReveal = (element: HTMLElement, error?: string) => {
    if (!registeredTargets.has(element) || element.getAttribute(REVEAL_STATE_ATTRIBUTE) === "revealed") return;
    clearCompletion(element);
    activeTargets.delete(element);
    setRevealState(element, "revealed");
    syncDebugCounts(error ? "reveal-fallback" : "revealed", error ? { lastError: error } : {});
  };

  const rearmReveal = (element: HTMLElement, label = "rearmed") => {
    if (!registeredTargets.has(element) || element.getAttribute(REVEAL_STATE_ATTRIBUTE) !== "revealed") return;
    clearCompletion(element);
    activeTargets.add(element);
    setRevealState(element, "pending");
    syncDebugCounts(label);
  };

  const startReveal = (element: HTMLElement, animate = true) => {
    if (!activeTargets.has(element) || element.getAttribute(REVEAL_STATE_ATTRIBUTE) !== "pending") return;
    if (!animate || document.visibilityState !== "visible") {
      completeReveal(element);
      return;
    }

    setRevealState(element, "animating");
    triggerPrismPortal(element);
    const handleMotionEnd: EventListener = (event) => {
      if (event.target !== element) return;
      const animationName = (event as AnimationEvent).animationName;
      if (animationName !== "kinetic-fly-settle" && animationName !== "kinetic-simple-lift") return;
      const cancelled = event.type === "animationcancel";
      completeReveal(element, cancelled ? `Animation cancelled for ${element.getAttribute("data-kinetic-reveal") ?? "target"}` : undefined);
    };
    completionHandlers.set(element, handleMotionEnd);
    element.addEventListener("animationend", handleMotionEnd);
    element.addEventListener("animationcancel", handleMotionEnd);
    const variant = element.getAttribute("data-kinetic-reveal") ?? "target";
    const splitAssembly = variant === "split-assembly";
    completionTimers.set(element, window.setTimeout(() => {
      completeReveal(element, splitAssembly ? undefined : `Animation safety timeout for ${variant}`);
    }, splitAssembly ? 1_250 : KINETIC_REVEAL_COMPLETE_MS));
    syncDebugCounts("animating", { lastError: null });
  };

  const failOpen = (error: string) => {
    if (failedOpen) return;
    failedOpen = true;
    root.classList.remove("kinetic-motion-ready", "kinetic-motion-simple");
    registeredTargets.forEach((element) => {
      clearCompletion(element);
      revealImmediately(element);
    });
    revealAll(root);
    activeTargets.clear();
    observer?.disconnect();
    mutationObserver?.disconnect();
    syncDebugCounts("fail-open", {
      readyClass: false,
      revealedCount: root.querySelectorAll(REVEAL_SELECTOR).length,
      lastError: error
    });
  };

  const revealPassedTargets = () => {
    if (failedOpen) return;
    try {
      const bounds = scrollBounds(scrollContainer);
      [...activeTargets].forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom <= bounds.top + 1) {
          completeReveal(element);
          if (isOutsideReplayZone(rect, bounds)) rearmReveal(element, "passed-rearmed");
        }
      });
    } catch (error) {
      failOpen(`Passed-target check failed: ${String(error)}`);
    }
  };

  const rearmExitedTargets = () => {
    if (failedOpen) return;
    try {
      const bounds = scrollBounds(scrollContainer);
      registeredTargets.forEach((element) => {
        if (element.getAttribute(REVEAL_STATE_ATTRIBUTE) !== "revealed") return;
        if (isOutsideReplayZone(element.getBoundingClientRect(), bounds)) rearmReveal(element);
      });
    } catch (error) {
      failOpen(`Replay rearm failed: ${String(error)}`);
    }
  };

  const revealVisibleTargets = () => {
    if (failedOpen) return;
    try {
      const bounds = scrollBounds(scrollContainer);
      const activationBottom = bounds.bottom - Math.max(12, (bounds.bottom - bounds.top) * (window.innerWidth <= 640 ? 0.04 : 0.08));
      activeTargets.forEach((element) => {
        if (element.getAttribute(REVEAL_STATE_ATTRIBUTE) !== "pending") return;
        const rect = element.getBoundingClientRect();
        if (rect.bottom > bounds.top && rect.top < activationBottom) startReveal(element);
      });
    } catch (error) {
      failOpen(`Visible-target check failed: ${String(error)}`);
    }
  };

  const handleScroll = () => {
    rearmExitedTargets();
    revealVisibleTargets();
    if (scrollFallbackTimer === undefined) {
      scrollFallbackTimer = window.setTimeout(() => {
        scrollFallbackTimer = undefined;
        revealVisibleTargets();
      }, 48);
    }
    if (scrollSettleTimer !== undefined) window.clearTimeout(scrollSettleTimer);
    scrollSettleTimer = window.setTimeout(() => {
      scrollSettleTimer = undefined;
      rearmExitedTargets();
      revealVisibleTargets();
      revealPassedTargets();
    }, 900);
  };

  const observeElement = (element: HTMLElement) => {
    if (registeredTargets.has(element)) return;
    if (element.matches("h1, h2, h3")) element.dataset.kineticEcho = (element.textContent ?? "").trim().slice(0, 180);
    registeredTargets.add(element);
    activeTargets.add(element);
    setRevealState(element, "pending");
    observer?.observe(element);
  };

  const collectTargets = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(REVEAL_SELECTOR)) observeElement(node);
    node.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(observeElement);
  };

  const unregisterElement = (element: HTMLElement) => {
    if (!registeredTargets.has(element)) return;
    clearCompletion(element);
    observer?.unobserve(element);
    registeredTargets.delete(element);
    activeTargets.delete(element);
  };

  const unregisterTargets = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(REVEAL_SELECTOR)) unregisterElement(node);
    node.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(unregisterElement);
  };

  const prismPortal = (() => {
    if (typeof document.createElement !== "function") return null;
    const portal = document.createElement("div");
    portal.className = "kinetic-prism-portal";
    portal.setAttribute("aria-hidden", "true");
    ["cyan", "violet", "pink"].forEach((tone) => {
      const blade = document.createElement("i");
      blade.className = `kinetic-prism-blade is-${tone}`;
      portal.appendChild(blade);
    });
    root.appendChild(portal);
    return portal;
  })();

  try {
    observer = new IntersectionObserver((entries) => {
      if (disposed || failedOpen) return;
      const boundary = scrollBounds(scrollContainer).top + 1;
      const bounds = scrollBounds(scrollContainer);
      entries.forEach((entry) => {
        const element = entry.target as HTMLElement;
        const state = element.getAttribute(REVEAL_STATE_ATTRIBUTE);
        if (state === "revealed") {
          if (!entry.isIntersecting && isOutsideReplayZone(entry.boundingClientRect, bounds)) rearmReveal(element);
          return;
        }
        if (!activeTargets.has(element)) return;
        if (entry.isIntersecting) {
          if (state === "pending") {
            intersectionCount += 1;
            syncDebugCounts("intersection");
          }
          startReveal(element);
          return;
        }
        if (entry.boundingClientRect.bottom <= boundary) {
          completeReveal(element);
          if (isOutsideReplayZone(entry.boundingClientRect, bounds)) rearmReveal(element, "passed-rearmed");
        }
      });
    }, {
      threshold: observerThreshold,
      rootMargin: observerRootMargin,
      root: scrollContainer instanceof HTMLElement ? scrollContainer : null
    });

    root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(observeElement);
  } catch (error) {
    failOpen(`Observer initialization failed: ${String(error)}`);
  }

  if (failedOpen) return () => {
    prismPortal?.remove();
    clearDebug();
  };

  if (registeredTargets.size === 0) {
    failOpen("No reveal targets registered");
    return () => {
      prismPortal?.remove();
      clearDebug();
    };
  }

  const cssLoaded = kineticCssLoaded(registeredTargets.values().next().value as HTMLElement);
  updateDebug("css", { cssLoaded });
  if (!cssLoaded) {
    failOpen("Kinetic reveal CSS marker missing");
    return () => {
      prismPortal?.remove();
      clearDebug();
    };
  }

  const profile = navigator as NavigatorPerformanceProfile;
  if (isSimpleKineticDevice({
    width: window.innerWidth,
    memoryGb: profile.deviceMemory,
    cores: profile.hardwareConcurrency,
    saveData: profile.connection?.saveData
  })) {
    root.classList.add("kinetic-motion-simple");
  }
  root.classList.add("kinetic-motion-ready");
  syncDebugCounts("ready", { readyClass: true, cssLoaded: true });

  try {
    mutationObserver = new MutationObserver((records) => {
      try {
        records.forEach((record) => {
          record.removedNodes.forEach(unregisterTargets);
          record.addedNodes.forEach(collectTargets);
        });
        syncDebugCounts("targets-updated");
        revealVisibleTargets();
      } catch (error) {
        failOpen(`Dynamic target registration failed: ${String(error)}`);
      }
    });
    mutationObserver.observe(root, { childList: true, subtree: true });
  } catch (error) {
    failOpen(`Mutation observer initialization failed: ${String(error)}`);
  }

  if (failedOpen) return () => {
    prismPortal?.remove();
    clearDebug();
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted) failOpen("Back-forward cache restore");
  };
  const handleMotionChange = (event: MediaQueryListEvent) => {
    if (event.matches && !forceMotion) failOpen("Reduced motion enabled");
  };
  const handleViewportChange = () => {
    if (disposed || failedOpen) return;
    try {
      observer?.disconnect();
      registeredTargets.forEach((element) => observer?.observe(element));
      rearmExitedTargets();
      revealPassedTargets();
      revealVisibleTargets();
    } catch (error) {
      failOpen(`Viewport refresh failed: ${String(error)}`);
    }
  };
  const handleScrollEnd = () => {
    rearmExitedTargets();
    revealVisibleTargets();
    revealPassedTargets();
  };

  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("resize", handleViewportChange, { passive: true });
  window.addEventListener("orientationchange", handleViewportChange);
  scrollTargets.forEach((target) => target.addEventListener("scroll", handleScroll, { passive: true }));
  scrollTargets.forEach((target) => target.addEventListener("scrollend", handleScrollEnd));
  motionQuery?.addEventListener?.("change", handleMotionChange);
  document.fonts?.ready.then(() => {
    if (!disposed) handleScrollEnd();
  }).catch(() => {
    // Font readiness is an enhancement only; the scroll fallback remains active.
  });
  handleScroll();

  return () => {
    disposed = true;
    window.removeEventListener("pageshow", handlePageShow);
    window.removeEventListener("resize", handleViewportChange);
    window.removeEventListener("orientationchange", handleViewportChange);
    scrollTargets.forEach((target) => target.removeEventListener("scroll", handleScroll));
    scrollTargets.forEach((target) => target.removeEventListener("scrollend", handleScrollEnd));
    motionQuery?.removeEventListener?.("change", handleMotionChange);
    observer?.disconnect();
    mutationObserver?.disconnect();
    registeredTargets.forEach(clearCompletion);
    if (scrollFallbackTimer !== undefined) window.clearTimeout(scrollFallbackTimer);
    if (scrollSettleTimer !== undefined) window.clearTimeout(scrollSettleTimer);
    revealAll(root);
    registeredTargets.clear();
    activeTargets.clear();
    prismPortal?.remove();
    root.classList.remove("kinetic-motion-ready", "kinetic-motion-simple");
    updateDebug("unmounted", { mounted: false, readyClass: false, animatingCount: 0 });
    clearDebug();
  };
}

export function useKineticReveal(
  rootRef: RefObject<HTMLElement>,
  { disabled = false }: { disabled?: boolean } = {}
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return setupKineticReveal(root, { disabled });
  }, [disabled, rootRef]);
}
