import { setTimeout as delay } from "node:timers/promises";

export const LOCAL_SERVICE_READINESS_TIMEOUT_MS = 3 * 60_000;

export async function waitForHttpReady(
  url,
  {
    timeoutMs = LOCAL_SERVICE_READINESS_TIMEOUT_MS,
    intervalMs = 250,
    fetchImpl = globalThis.fetch,
    delayImpl = delay,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const response = await fetchImpl(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // Compilation, a cold database connection, or runtime bootstrap can
      // temporarily keep the local port unavailable.
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await delayImpl(Math.min(intervalMs, remainingMs));
  } while (true);

  throw new Error(`did not become ready at ${url} within ${timeoutMs}ms`);
}
