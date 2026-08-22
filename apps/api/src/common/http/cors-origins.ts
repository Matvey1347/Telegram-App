function normalizedHttpOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function corsOrigins(...configuredOrigins: Array<string | undefined>) {
  return [
    ...new Set(
      configuredOrigins
        .map(normalizedHttpOrigin)
        .filter((origin): origin is string => Boolean(origin)),
    ),
  ];
}

/** Allow the canonical web origin and its equivalent www/non-www hostname. */
export function webCorsOrigins(configuredOrigin: string | undefined) {
  const [origin] = corsOrigins(configuredOrigin);
  if (!origin) return [];

  const url = new URL(origin);
  if (url.hostname === 'localhost' || url.hostname.includes(':')) {
    return [origin];
  }

  url.hostname = url.hostname.startsWith('www.')
    ? url.hostname.slice(4)
    : `www.${url.hostname}`;

  return corsOrigins(origin, url.origin);
}
