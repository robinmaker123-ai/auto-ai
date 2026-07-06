export function isMobileAppRuntime() {
  if (typeof window === "undefined") return false;
  const { protocol, hostname } = window.location;
  const capacitor = window.Capacitor as { getPlatform?: () => string } | undefined;
  const platform = capacitor?.getPlatform?.();
  return (
    platform === "android" ||
    platform === "ios" ||
    protocol === "capacitor:" ||
    protocol === "ionic:" ||
    (protocol === "https:" && hostname === "localhost")
  );
}

export function isLocalPageWithRemoteApi(apiBaseUrl: string) {
  if (typeof window === "undefined") return false;
  const pageHost = window.location.hostname;
  const localPage = pageHost === "localhost" || pageHost === "127.0.0.1";
  if (!localPage) return false;
  try {
    const apiHost = new URL(apiBaseUrl).hostname;
    return apiHost !== "localhost" && apiHost !== "127.0.0.1";
  } catch {
    return false;
  }
}
