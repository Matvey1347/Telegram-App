export type BrowserApiLocation = Pick<
  Location,
  "hostname" | "origin" | "protocol"
>;

function normalizeApiBase(value: string | undefined) {
  const configured = value?.trim();
  if (!configured) return "/api";

  if (configured.startsWith("/")) {
    const relative = configured.replace(/\/+$/u, "");
    if (!relative) return "/api";
    return relative.endsWith("/api") ? relative : `${relative}/api`;
  }

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "/api";
    }
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
    const hostname = new URL(value).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Resolves the browser API topology without product- or tunnel-specific rules.
 * A public HTTPS page never calls a loopback address embedded at build time;
 * its deployment gateway is expected to expose the API at same-origin `/api`.
 */
export function resolveBrowserApiBase(
  configuredApiUrl: string | undefined,
  location: BrowserApiLocation | undefined =
    typeof window === "undefined" ? undefined : window.location,
) {
  const configured = normalizeApiBase(configuredApiUrl);
  if (location?.protocol === "https:" && isLoopbackApi(configured)) {
    return "/api";
  }
  return configured;
}
