export type BrowserApiLocation = Pick<Location, "hostname">;

function normalizeApiBase(value: string | undefined) {
  const configured = value?.trim();
  if (!configured) return "/api";
  if (configured.startsWith("/")) {
    const relative = configured.replace(/\/+$/u, "");
    return !relative ? "/api" : relative.endsWith("/api") ? relative : `${relative}/api`;
  }
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "/api";
    parsed.search = "";
    parsed.hash = "";
    const absolute = parsed.toString().replace(/\/+$/u, "");
    return absolute.endsWith("/api") ? absolute : `${absolute}/api`;
  } catch {
    return "/api";
  }
}

function isLoopbackApi(value: string) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

/** A public Finance page never retains a local API origin from its build. */
export function resolveFinanceBrowserApiBase(
  configuredApiUrl: string | undefined,
  location: BrowserApiLocation | undefined =
    typeof window === "undefined" ? undefined : window.location,
) {
  const configured = normalizeApiBase(configuredApiUrl);
  return location && !isLoopbackHost(location.hostname) && isLoopbackApi(configured)
    ? "/api"
    : configured;
}
