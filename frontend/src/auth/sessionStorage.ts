const ACCESS_TOKEN_KEY = "auto-ai-access-token";
const REFRESH_TOKEN_KEY = "auto-ai-refresh-token";
const LEGACY_TOKEN_KEY = "auto-ai-token";

type NativeSecureStorage = {
  get: (options: { key: string }) => Promise<{ value?: string | null }>;
  set: (options: { key: string; value: string }) => Promise<void>;
  remove: (options: { key: string }) => Promise<void>;
};

declare global {
  interface Window {
    Capacitor?: {
      getPlatform?: () => string;
      Plugins?: {
        AutoAiSecureStorage?: NativeSecureStorage;
        AutoAiGoogleAuth?: {
          signIn: (options: { clientId: string }) => Promise<{ idToken?: string; email?: string; name?: string; picture?: string }>;
          signOut?: () => Promise<void>;
        };
      };
    };
  }
}

export type StoredAuthSession = {
  accessToken: string | null;
  refreshToken: string | null;
};

export function nativeSecureStorage() {
  return typeof window !== "undefined" ? window.Capacitor?.Plugins?.AutoAiSecureStorage : undefined;
}

export function nativeGoogleAuth() {
  return typeof window !== "undefined" ? window.Capacitor?.Plugins?.AutoAiGoogleAuth : undefined;
}

function readLocalStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn("[Auto-AI Auth] Unable to read saved browser session.", error);
    return null;
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("[Auto-AI Auth] Unable to save browser session.", error);
  }
}

function removeLocalStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("[Auto-AI Auth] Unable to remove saved browser session.", error);
  }
}

export async function readStoredSession(): Promise<StoredAuthSession> {
  const secureStorage = nativeSecureStorage();
  if (secureStorage) {
    const [access, refresh] = await Promise.all([
      secureStorage.get({ key: ACCESS_TOKEN_KEY }),
      secureStorage.get({ key: REFRESH_TOKEN_KEY })
    ]);
    return {
      accessToken: access.value ?? null,
      refreshToken: refresh.value ?? null
    };
  }
  return {
    accessToken: readLocalStorage(ACCESS_TOKEN_KEY) || readLocalStorage(LEGACY_TOKEN_KEY),
    refreshToken: readLocalStorage(REFRESH_TOKEN_KEY)
  };
}

export async function writeStoredSession(accessToken: string, refreshToken?: string | null) {
  const secureStorage = nativeSecureStorage();
  if (secureStorage) {
    const writes = [secureStorage.set({ key: ACCESS_TOKEN_KEY, value: accessToken })];
    writes.push(
      refreshToken
        ? secureStorage.set({ key: REFRESH_TOKEN_KEY, value: refreshToken })
        : secureStorage.remove({ key: REFRESH_TOKEN_KEY })
    );
    await Promise.all(writes);
    return;
  }
  writeLocalStorage(ACCESS_TOKEN_KEY, accessToken);
  writeLocalStorage(LEGACY_TOKEN_KEY, accessToken);
  if (refreshToken) {
    writeLocalStorage(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    removeLocalStorage(REFRESH_TOKEN_KEY);
  }
}

export async function removeStoredSession() {
  const secureStorage = nativeSecureStorage();
  if (secureStorage) {
    await Promise.all([
      secureStorage.remove({ key: ACCESS_TOKEN_KEY }),
      secureStorage.remove({ key: REFRESH_TOKEN_KEY })
    ]);
  }
  removeLocalStorage(ACCESS_TOKEN_KEY);
  removeLocalStorage(REFRESH_TOKEN_KEY);
  removeLocalStorage(LEGACY_TOKEN_KEY);
}
