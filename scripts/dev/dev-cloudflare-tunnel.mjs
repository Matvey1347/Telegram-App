const QUICK_TUNNEL_HOST = /^[a-z0-9-]+\.trycloudflare\.com$/i;
const RESERVED_HOSTS = new Set([
  "api.trycloudflare.com",
  "www.trycloudflare.com",
  "trycloudflare.com",
]);

export function extractCloudflareQuickTunnelUrl(line) {
  const candidates = line.match(/https:\/\/[^\s"']+/giu) ?? [];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.replace(/[),.;]+$/u, ""));
      if (
        QUICK_TUNNEL_HOST.test(url.hostname) &&
        !RESERVED_HOSTS.has(url.hostname.toLowerCase())
      ) {
        return url.origin;
      }
    } catch {
      // Ignore non-URL fragments from cloudflared diagnostic output.
    }
  }
  return null;
}
