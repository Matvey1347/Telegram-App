function normalizedOrigin(value, defaultProtocol) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const candidate = defaultProtocol && !/^https?:\/\//iu.test(trimmed)
      ? `${defaultProtocol}://${trimmed}`
      : trimmed;
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function railwayPublicOrigin(domain) {
  return normalizedOrigin(domain, "https");
}

function isDevelopmentTunnelOrigin(value) {
  const origin = normalizedOrigin(value);
  if (!origin) return false;
  const host = new URL(origin).hostname.toLowerCase();
  return (
    host === "ngrok.io" ||
    host.endsWith(".ngrok.io") ||
    host === "ngrok-free.app" ||
    host.endsWith(".ngrok-free.app") ||
    host === "trycloudflare.com" ||
    host.endsWith(".trycloudflare.com")
  );
}

function productionOrigin(configured, railwayOrigin) {
  const explicit = configured?.trim();
  return explicit && !isDevelopmentTunnelOrigin(explicit)
    ? explicit
    : railwayOrigin;
}

export function railwayPublicEnvironment(domain, environment = {}) {
  const publicOrigin = railwayPublicOrigin(domain);
  if (!publicOrigin) return null;
  return {
    publicOrigin,
    values: {
      API_PUBLIC_URL: productionOrigin(
        environment.API_PUBLIC_URL,
        publicOrigin,
      ),
      FRONTEND_URL: productionOrigin(environment.FRONTEND_URL, publicOrigin),
    },
  };
}

export function localBotPublicEnvironment(origin) {
  const publicOrigin = normalizedOrigin(origin);
  if (!publicOrigin) {
    throw new Error("Local bot development requires a public HTTP(S) origin.");
  }
  return {
    API_PUBLIC_URL: publicOrigin,
    FRONTEND_URL: publicOrigin,
  };
}
