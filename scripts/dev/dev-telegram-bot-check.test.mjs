import assert from "node:assert/strict";
import test from "node:test";
import { checkDevTelegramBot, checkDevTelegramWebhook, sharesBotIdentity } from "./dev-telegram-bot-check.mjs";

const profile = { token: "123456:fixture", username: "@FinanceBot" };
const response = (result) => Response.json({ ok: true, result });

test("rejects a LOCAL runtime sharing the production bot identity after rotation", () => {
  const local = { id: "local", environment: "LOCAL", token: "12345:previous" };
  const prod = { id: "production", environment: "PRODUCTION", token: "12345:replacement" };
  assert.equal(sharesBotIdentity(local, [local, prod]), true);
  assert.equal(sharesBotIdentity(prod, [local, prod]), false);
  assert.equal(sharesBotIdentity(local, [local, { ...prod, token: "98765:replacement" }]), false);
});

test("validates bot identity and reports a production webhook without its path", async () => {
  const result = await checkDevTelegramBot(profile, async (url) =>
    url.endsWith("/getMe")
      ? response({ is_bot: true, username: "financebot" })
      : response({ url: "https://api.example.test/private-webhook" }),
  );
  assert.deepEqual(result, {
    status: "valid", webhook: { status: "registered", origin: "https://api.example.test" },
  });
});

test("reports a revoked token immediately without returning the Telegram error body", async () => {
  let calls = 0;
  const result = await checkDevTelegramBot(profile, async () => {
    calls++;
    return Response.json({ ok: false, description: profile.token }, { status: 401 });
  });
  assert.deepEqual(result, { status: "invalid" });
  assert.equal(calls, 1);
});

test("does not call the webhook API for a token belonging to another bot", async () => {
  const result = await checkDevTelegramBot(profile, async (url) => {
    assert.ok(url.endsWith("/getMe"));
    return response({ is_bot: true, username: "otherbot" });
  });
  assert.deepEqual(result, { status: "usernameMismatch" });
});

test("distinguishes connectivity failures from invalid credentials", async () => {
  const result = await checkDevTelegramBot(profile, async () => {
    throw new Error(`Transport error for ${profile.token}`);
  });
  assert.deepEqual(result, { status: "unavailable" });
});

test("does not report a webhook with a recent delivery failure as healthy", async () => {
  const result = await checkDevTelegramWebhook(profile.token, async () => response({
    url: "https://api.example.test/hook",
    pending_update_count: 2,
    last_error_date: Math.floor(Date.now() / 1000),
  }));
  assert.equal(result.status, "deliveryError");
});
