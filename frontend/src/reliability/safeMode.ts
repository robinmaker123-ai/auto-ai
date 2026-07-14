export type SafeModeState = {
  enabled: boolean;
  reason?: string;
  enabledAt?: number;
};

type LaunchRecord = {
  id: string;
  startedAt: number;
  stableAt?: number;
};

type StartupFailure = {
  at: number;
  ageMs: number;
};

const SAFE_MODE_KEY = "auto-ai-safe-mode";
const LAUNCH_KEY = "auto-ai-startup-launch";
const FAILURES_KEY = "auto-ai-startup-failures";
const SAFE_ROOT_KEY = "auto-ai-safe-root-requested";
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const FAILURE_MIN_AGE_MS = 1500;
const FAILURE_MAX_AGE_MS = 2 * 60 * 1000;
const FAILURE_THRESHOLD = 2;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function safeId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function readSafeModeState(): SafeModeState {
  return readJson<SafeModeState>(SAFE_MODE_KEY, { enabled: false });
}

export function isSafeModeEnabled() {
  return readSafeModeState().enabled === true;
}

export function enableSafeMode(reason = "manual") {
  writeJson<SafeModeState>(SAFE_MODE_KEY, { enabled: true, reason, enabledAt: Date.now() });
}

export function disableSafeMode() {
  writeJson<SafeModeState>(SAFE_MODE_KEY, { enabled: false });
  try {
    localStorage.removeItem(FAILURES_KEY);
  } catch {
    return;
  }
}

export function beginStartupRecovery() {
  if (typeof window === "undefined") return { safeMode: false, crashLoop: false };
  const now = Date.now();
  const previous = readJson<LaunchRecord | null>(LAUNCH_KEY, null);
  let failures = readJson<StartupFailure[]>(FAILURES_KEY, []).filter((item) => now - item.at <= FAILURE_WINDOW_MS);

  if (previous && !previous.stableAt) {
    const ageMs = now - previous.startedAt;
    if (ageMs >= FAILURE_MIN_AGE_MS && ageMs <= FAILURE_MAX_AGE_MS) {
      failures = [...failures, { at: now, ageMs }].slice(-FAILURE_THRESHOLD);
    }
  }

  const crashLoop = failures.length >= FAILURE_THRESHOLD;
  if (crashLoop) {
    enableSafeMode("startup-crash-loop");
    try {
      sessionStorage.setItem(SAFE_ROOT_KEY, "1");
    } catch {
      return { safeMode: true, crashLoop };
    }
  }

  writeJson<StartupFailure[]>(FAILURES_KEY, failures);
  writeJson<LaunchRecord>(LAUNCH_KEY, { id: safeId(), startedAt: now });
  return { safeMode: isSafeModeEnabled(), crashLoop };
}

export function markStartupStable() {
  const current = readJson<LaunchRecord | null>(LAUNCH_KEY, null);
  if (!current || current.stableAt) return;
  writeJson<LaunchRecord>(LAUNCH_KEY, { ...current, stableAt: Date.now() });
}

export function consumeSafeRootRedirect() {
  try {
    const requested = sessionStorage.getItem(SAFE_ROOT_KEY) === "1";
    sessionStorage.removeItem(SAFE_ROOT_KEY);
    return requested;
  } catch {
    return false;
  }
}
