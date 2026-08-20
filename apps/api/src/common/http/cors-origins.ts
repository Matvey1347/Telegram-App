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
