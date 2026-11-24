const telegramToken = /^\d+:[A-Za-z0-9_-]+$/u;
const telegramUsername = /^[A-Za-z0-9_]{1,32}$/u;

export function sharesBotIdentity(profile, profiles) {
  if (profile.environment !== "LOCAL" || !telegramToken.test(profile.token ?? "")) return false;
  const botId = profile.token.split(":")[0];
  return profiles.some((candidate) => candidate.id !== profile.id && candidate.token?.split(":")[0] === botId);
}

export async function checkDevTelegramBot(profile, fetchImpl = fetch) {
  const { token, username } = profile;
  if (!token) return { status: "missing" };
  if (!telegramToken.test(token)) return { status: "invalid" };
  const identity = await readTelegram(token, "getMe", fetchImpl);
  if (identity.status !== "ok") return identity;
  const actualUsername = identity.result?.username;
  if (!telegramUsername.test(actualUsername ?? "") || identity.result?.is_bot !== true)
    return { status: "unavailable" };
  if (!username || actualUsername.toLowerCase() !== username.replace(/^@/u, "").toLowerCase())
    return { status: "usernameMismatch" };
  const webhook = await checkDevTelegramWebhook(token, fetchImpl);
  return { status: "valid", webhook };
}

export async function checkDevTelegramWebhook(token, fetchImpl = fetch) {
  const response = await readTelegram(token, "getWebhookInfo", fetchImpl);
  if (response.status !== "ok") return { status: response.status };
  const { url, pending_update_count, last_error_date } = response.result ?? {};
  if (typeof url !== "string") return { status: "unavailable" };
  if (!url) return { status: "absent" };
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== "https:") return { status: "unavailable" };
    const recentError = pending_update_count > 0 && last_error_date >= Date.now() / 1000 - 300;
    return { status: recentError ? "deliveryError" : "registered", origin: endpoint.origin };
  } catch {
    return { status: "unavailable" };
  }
}

async function readTelegram(token, method, fetchImpl) {
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if ([401, 404].includes(response.status)) return { status: "invalid" };
    const data = await response.json();
    if ([401, 404].includes(data?.error_code))
      return { status: "invalid" };
    if (!response.ok || !data.ok) return { status: "unavailable" };
    return { status: "ok", result: data.result };
  } catch {
    return { status: "unavailable" };
  }
}
