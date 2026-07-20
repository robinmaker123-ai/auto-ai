import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KINETIC_REVEAL_COMPLETE_MS } from "../motion/kineticRevealConfig";
import { setupKineticReveal } from "./useKineticReveal";

class FakeClassList {
  private readonly values = new Set<string>();
  add(...tokens: string[]) { tokens.forEach((token) => this.values.add(token)); }
  remove(...tokens: string[]) { tokens.forEach((token) => this.values.delete(token)); }
  contains(token: string) { return this.values.has(token); }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly targets: FakeElement[] = [];
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  revealTarget = false;
  rectTop = 0;
  rectBottom = 100;
  scrollHeight = 100;
  clientHeight = 100;
  overflowY = "visible";
  offsetWidthReads = 0;
  id = "";
  className = "";
  tagName = "DIV";
  textContent = "";

  get offsetWidth() { this.offsetWidthReads += 1; return 100; }
  matches(selector: string) {
    if (selector === "[data-kinetic-reveal]") return this.revealTarget;
    if (selector.includes("h1")) return ["H1", "H2", "H3"].includes(this.tagName);
    return false;
  }
  querySelector<T extends Element>() { return null as T | null; }
  querySelectorAll<T extends Element>() { return this.targets as unknown as NodeListOf<T>; }
  getBoundingClientRect() { return { top: this.rectTop, bottom: this.rectBottom, height: this.rectBottom - this.rectTop } as DOMRect; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, details: Record<string, unknown> = {}) {
    this.listeners.get(type)?.forEach((listener) => {
      const event = { type, target: this, ...details } as unknown as Event;
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    });
  }
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;
  unobserveCount = 0;

  constructor(private readonly callback: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(element: Element) { this.observed.add(element); }
  unobserve(element: Element) { this.unobserveCount += 1; this.observed.delete(element); }
  disconnect() { this.disconnected = true; this.observed.clear(); }
  trigger(element: FakeElement, isIntersecting = true) {
    this.callback([{
      isIntersecting,
      target: element,
      boundingClientRect: element.getBoundingClientRect()
    } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  disconnected = false;
  constructor(_callback: MutationCallback) { FakeMutationObserver.instances.push(this); }
  observe() {}
  disconnect() { this.disconnected = true; }
}

function installBrowserGlobals({
  reducedMotion = false,
  width = 1280,
  visibility = "hidden",
  debug = false,
  hostname = "example.test",
  navigationType = "navigate"
}: {
  reducedMotion?: boolean;
  width?: number;
  visibility?: DocumentVisibilityState;
  debug?: boolean;
  hostname?: string;
  navigationType?: NavigationTimingType;
} = {}) {
  const windowListeners = new Map<string, Set<EventListener>>();
  const documentListeners = new Map<string, Set<EventListener>>();
  const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    matches: reducedMotion,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener)
  };
  const addListener = (map: Map<string, Set<EventListener>>) => (type: string, listener: EventListener) => {
    const listeners = map.get(type) ?? new Set();
    listeners.add(listener);
    map.set(type, listeners);
  };
  const removeListener = (map: Map<string, Set<EventListener>>) => (type: string, listener: EventListener) => {
    map.get(type)?.delete(listener);
  };
  const documentElement = new FakeElement();
  const browserWindow = {
    __AUTOAI_MOTION_DEBUG__: undefined as Window["__AUTOAI_MOTION_DEBUG__"],
    IntersectionObserver: FakeIntersectionObserver,
    MutationObserver: FakeMutationObserver,
    innerWidth: width,
    innerHeight: 800,
    location: { hostname, search: debug ? "?motionDebug=1" : "" },
    matchMedia: () => mediaQuery,
    getComputedStyle: (element: FakeElement) => ({
      overflowY: element.overflowY,
      getPropertyValue: (name: string) => name === "--auto-ai-kinetic-css" ? "1" : ""
    }),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    addEventListener: addListener(windowListeners),
    removeEventListener: removeListener(windowListeners)
  };
  const browserDocument = {
    documentElement,
    visibilityState: visibility,
    addEventListener: addListener(documentListeners),
    removeEventListener: removeListener(documentListeners)
  };

  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("MutationObserver", FakeMutationObserver);
  vi.stubGlobal("window", browserWindow);
  vi.stubGlobal("document", browserDocument);
  vi.stubGlobal("navigator", { deviceMemory: 8, hardwareConcurrency: 8, connection: { saveData: false } });
  vi.stubGlobal("performance", { getEntriesByType: () => [{ type: navigationType }] });
  return {
    browserWindow,
    documentElement,
    dispatchWindow(type: string) {
      windowListeners.get(type)?.forEach((listener) => listener({ type } as Event));
    }
  };
}

function createScope({ targetCount = 1 } = {}) {
  const scrollContainer = new FakeElement();
  scrollContainer.scrollHeight = 2000;
  scrollContainer.clientHeight = 800;
  scrollContainer.overflowY = "auto";
  scrollContainer.id = "root";
  const root = new FakeElement();
  root.parentElement = scrollContainer;
  const targets = Array.from({ length: targetCount }, () => {
    const target = new FakeElement();
    target.revealTarget = true;
    root.targets.push(target);
    return target;
  });
  return { root, target: targets[0], targets, scrollContainer };
}

describe("setupKineticReveal", () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    FakeMutationObserver.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("replays only after a completed target fully exits the viewport", () => {
    installBrowserGlobals({ visibility: "visible" });
    const { root, target, scrollContainer } = createScope();
    target.rectTop = 900;
    target.rectBottom = 980;
    const cleanup = setupKineticReveal(root as unknown as HTMLElement);
    const observer = FakeIntersectionObserver.instances[0];

    expect(root.classList.contains("kinetic-motion-ready")).toBe(true);
    expect(target.getAttribute("data-reveal-state")).toBe("pending");
    expect(observer.options).toMatchObject({ threshold: 0.1, rootMargin: "0px 0px -8% 0px", root: scrollContainer });

    observer.trigger(target);
    expect(target.getAttribute("data-reveal-state")).toBe("animating");
    expect(target.classList.contains("is-revealed")).toBe(true);

    target.dispatch("transitionend", { propertyName: "opacity" });
    expect(target.getAttribute("data-reveal-state")).toBe("animating");

    target.dispatch("animationend", { animationName: "kinetic-heading-glow" });
    expect(target.getAttribute("data-reveal-state")).toBe("animating");

    target.dispatch("animationend", { animationName: "kinetic-fly-settle" });
    expect(target.getAttribute("data-reveal-state")).toBe("revealed");
    expect(target.classList.contains("is-kinetic-complete")).toBe(true);
    expect(observer.unobserveCount).toBe(0);
    expect(observer.observed.size).toBe(1);

    target.rectTop = -20;
    target.rectBottom = 10;
    observer.trigger(target, false);
    observer.trigger(target, true);
    expect(target.getAttribute("data-reveal-state")).toBe("revealed");

    target.rectTop = -200;
    target.rectBottom = -100;
    observer.trigger(target, false);
    expect(target.getAttribute("data-reveal-state")).toBe("pending");

    target.rectTop = 20;
    target.rectBottom = 70;
    observer.trigger(target, true);
    expect(target.getAttribute("data-reveal-state")).toBe("animating");
    target.dispatch("animationend", { animationName: "kinetic-fly-settle" });
    expect(target.getAttribute("data-reveal-state")).toBe("revealed");
    expect(target.offsetWidthReads).toBe(0);
    cleanup?.();
  });

  it("forces final visibility when an animation exceeds the safety timeout", () => {
    vi.useFakeTimers();
    installBrowserGlobals({ visibility: "visible" });
    const { root, target } = createScope();
    target.rectTop = 900;
    target.rectBottom = 980;
    const cleanup = setupKineticReveal(root as unknown as HTMLElement);

    FakeIntersectionObserver.instances[0].trigger(target);
    expect(target.getAttribute("data-reveal-state")).toBe("animating");
    vi.advanceTimersByTime(KINETIC_REVEAL_COMPLETE_MS);

    expect(target.getAttribute("data-reveal-state")).toBe("revealed");
    expect(target.classList.contains("is-kinetic-complete")).toBe(true);
    cleanup?.();
  });

  it("uses mobile observer settings while preserving directional variants", () => {
    installBrowserGlobals({ width: 390 });
    const { root, scrollContainer } = createScope();
    const cleanup = setupKineticReveal(root as unknown as HTMLElement);
    const observer = FakeIntersectionObserver.instances[0];

    expect(root.classList.contains("kinetic-motion-ready")).toBe(true);
    expect(root.classList.contains("kinetic-motion-simple")).toBe(false);
    expect(observer.options).toMatchObject({ threshold: 0.05, rootMargin: "0px 0px -4% 0px", root: scrollContainer });
    cleanup?.();
  });

  it("uses the document observer root when an ancestor only clips overflow", () => {
    installBrowserGlobals();
    const { root } = createScope();
    const clippedAncestor = new FakeElement();
    clippedAncestor.scrollHeight = 2000;
    clippedAncestor.clientHeight = 800;
    clippedAncestor.overflowY = "hidden";
    root.parentElement = clippedAncestor;

    const cleanup = setupKineticReveal(root as unknown as HTMLElement);
    expect(FakeIntersectionObserver.instances[0].options?.root).toBeNull();
    cleanup?.();
  });

  it("keeps an overflow owner as the root before async content makes it scrollable", () => {
    installBrowserGlobals();
    const { root, scrollContainer } = createScope();
    scrollContainer.scrollHeight = scrollContainer.clientHeight;

    const cleanup = setupKineticReveal(root as unknown as HTMLElement);
    expect(FakeIntersectionObserver.instances[0].options?.root).toBe(scrollContainer);
    cleanup?.();
  });

  it("keeps the application root while a loader temporarily locks its overflow", () => {
    installBrowserGlobals();
    const { root, scrollContainer } = createScope();
    scrollContainer.overflowY = "hidden";

    const cleanup = setupKineticReveal(root as unknown as HTMLElement);
    expect(FakeIntersectionObserver.instances[0].options?.root).toBe(scrollContainer);
    cleanup?.();
  });

  it("reveals from a nested scroll source even when the observer uses the document", () => {
    vi.useFakeTimers();
    installBrowserGlobals();
    const { root, target } = createScope();
    const nestedScroller = new FakeElement();
    nestedScroller.overflowY = "hidden";
    root.parentElement = nestedScroller;
    target.rectTop = 900;
    target.rectBottom = 980;

    const cleanup = setupKineticReveal(root as unknown as HTMLElement);
    target.rectTop = 20;
    target.rectBottom = 70;
    nestedScroller.dispatch("scroll");
    vi.advanceTimersByTime(50);

    expect(target.getAttribute("data-reveal-state")).toBe("revealed");
    cleanup?.();
  });

  it("rechecks after scroll settles so late layout shifts cannot leave text hidden", () => {
    vi.useFakeTimers();
    installBrowserGlobals();
    const { root, target, scrollContainer } = createScope();
    target.rectTop = 900;
    target.rectBottom = 980;

    const cleanup = setupKineticReveal(root as unknown as HTMLElement);
    scrollContainer.dispatch("scroll");
    target.rectTop = 20;
    target.rectBottom = 70;
    vi.advanceTimersByTime(900);

    expect(target.getAttribute("data-reveal-state")).toBe("revealed");
    cleanup?.();
  });

  it("rearms skipped targets after a fast scroll and reveals them on return", () => {
    installBrowserGlobals();
    const { root, target, scrollContainer } = createScope();
    target.rectTop = 900;
    target.rectBottom = 980;
    const cleanup = setupKineticReveal(root as unknown as HTMLElement);
    target.rectTop = -200;
    target.rectBottom = -100;

    scrollContainer.dispatch("scrollend");

    expect(target.getAttribute("data-reveal-state")).toBe("pending");
    expect(FakeIntersectionObserver.instances[0].observed.size).toBe(1);

    target.rectTop = 20;
    target.rectBottom = 70;
    scrollContainer.dispatch("scroll");
    expect(target.getAttribute("data-reveal-state")).toBe("revealed");
    cleanup?.();
  });

  it("reobserves every registered target after orientation changes", () => {
    const browser = installBrowserGlobals();
    const { root, target } = createScope();
    target.rectTop = 900;
    target.rectBottom = 980;
    const cleanup = setupKineticReveal(root as unknown as HTMLElement);
    const observer = FakeIntersectionObserver.instances[0];
    observer.trigger(target);
    expect(target.getAttribute("data-reveal-state")).toBe("revealed");

    browser.dispatchWindow("orientationchange");

    expect(observer.disconnected).toBe(true);
    expect(observer.observed.size).toBe(1);
    cleanup?.();
  });

  it("disconnects observers and restores visible content on cleanup", () => {
    installBrowserGlobals();
    const { root, target, scrollContainer } = createScope();
    target.rectTop = 900;
    target.rectBottom = 980;
    const cleanup = setupKineticReveal(root as unknown as HTMLElement);

    expect(scrollContainer.listeners.get("scrollend")?.size).toBe(1);
    cleanup?.();

    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
    expect(FakeMutationObserver.instances[0].disconnected).toBe(true);
    expect(scrollContainer.listeners.get("scrollend")?.size).toBe(0);
    expect(root.classList.contains("kinetic-motion-ready")).toBe(false);
    expect(target.getAttribute("data-reveal-state")).toBe("revealed");
  });

  it("keeps everything visible for reduced motion, editor mode, and back-forward restore", () => {
    installBrowserGlobals({ reducedMotion: true });
    const reducedScope = createScope();
    setupKineticReveal(reducedScope.root as unknown as HTMLElement);
    expect(reducedScope.target.getAttribute("data-reveal-state")).toBe("revealed");
    expect(FakeIntersectionObserver.instances).toHaveLength(0);

    vi.unstubAllGlobals();
    installBrowserGlobals();
    const editorScope = createScope();
    setupKineticReveal(editorScope.root as unknown as HTMLElement, { disabled: true });
    expect(editorScope.target.getAttribute("data-reveal-state")).toBe("revealed");
    expect(FakeIntersectionObserver.instances).toHaveLength(0);

    vi.unstubAllGlobals();
    installBrowserGlobals({ navigationType: "back_forward" });
    const restoredScope = createScope();
    setupKineticReveal(restoredScope.root as unknown as HTMLElement);
    expect(restoredScope.target.getAttribute("data-reveal-state")).toBe("revealed");
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("forces motion on the local development host without enabling diagnostics", () => {
    const browser = installBrowserGlobals({ hostname: "localhost", reducedMotion: true, visibility: "visible" });
    const { root, target } = createScope();
    target.rectTop = 900;
    target.rectBottom = 980;
    const cleanup = setupKineticReveal(root as unknown as HTMLElement);

    expect(root.classList.contains("kinetic-motion-ready")).toBe(true);
    expect(target.getAttribute("data-reveal-state")).toBe("pending");
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(browser.documentElement.getAttribute("data-auto-ai-force-motion")).toBe("true");
    expect(browser.browserWindow.__AUTOAI_MOTION_DEBUG__).toBeUndefined();

    cleanup?.();
    expect(browser.documentElement.getAttribute("data-auto-ai-force-motion")).toBeNull();
  });

  it("fails open when observer construction fails or no targets register", () => {
    installBrowserGlobals();
    const failedScope = createScope();
    vi.stubGlobal("IntersectionObserver", class { constructor() { throw new Error("observer unavailable"); } });
    setupKineticReveal(failedScope.root as unknown as HTMLElement);
    expect(failedScope.root.classList.contains("kinetic-motion-ready")).toBe(false);
    expect(failedScope.target.getAttribute("data-reveal-state")).toBe("revealed");

    vi.unstubAllGlobals();
    installBrowserGlobals();
    const emptyScope = createScope({ targetCount: 0 });
    setupKineticReveal(emptyScope.root as unknown as HTMLElement);
    expect(emptyScope.root.classList.contains("kinetic-motion-ready")).toBe(false);

    vi.unstubAllGlobals();
    installBrowserGlobals();
    const mutationFailureScope = createScope();
    vi.stubGlobal("MutationObserver", class { constructor() { throw new Error("mutation observer unavailable"); } });
    setupKineticReveal(mutationFailureScope.root as unknown as HTMLElement);
    expect(mutationFailureScope.root.classList.contains("kinetic-motion-ready")).toBe(false);
    expect(mutationFailureScope.target.getAttribute("data-reveal-state")).toBe("revealed");
  });

  it("exposes diagnostics only for the development motionDebug URL", () => {
    const browser = installBrowserGlobals({ debug: true });
    const { root, target } = createScope();
    target.rectTop = 900;
    target.rectBottom = 980;
    const cleanup = setupKineticReveal(root as unknown as HTMLElement);

    expect(browser.browserWindow.__AUTOAI_MOTION_DEBUG__).toMatchObject({
      mounted: true,
      cssLoaded: true,
      readyClass: true,
      reducedMotion: false,
      scrollRoot: "#root",
      observedCount: 1,
      revealedCount: 0,
      lastError: null
    });
    expect(root.getAttribute("data-auto-ai-motion-debug")).toBe("true");
    expect(browser.documentElement.getAttribute("data-auto-ai-force-motion")).toBe("true");

    cleanup?.();
    expect(browser.browserWindow.__AUTOAI_MOTION_DEBUG__).toBeUndefined();
    expect(root.getAttribute("data-auto-ai-motion-debug")).toBeNull();
    expect(browser.documentElement.getAttribute("data-auto-ai-force-motion")).toBeNull();
  });
});
