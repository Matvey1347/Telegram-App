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

export function railwayPublicEnvironment(domain, environment = {}) {
  const publicOrigin = railwayPublicOrigin(domain);
  if (!publicOrigin) return null;
  return {
    publicOrigin,
    values: {
      API_PUBLIC_URL: environment.API_PUBLIC_URL?.trim() || publicOrigin,
      FRONTEND_URL: environment.FRONTEND_URL?.trim() || publicOrigin,
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
