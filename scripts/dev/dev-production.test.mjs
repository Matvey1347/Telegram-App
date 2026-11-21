import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { requireLocalDatabase } from "./dev-local-database.mjs";
import { createProductionGateway } from "./dev-production-gateway.mjs";
import { productionRoute } from "./dev-production-policy.mjs";
import { operatorConfiguration, productionDatabaseFingerprint } from "./dev-production-profile.mjs";
import { productionWebEnvironment } from "./dev-production.mjs";

const scope = { userId: "test-owner", channelId: "test-channel", workspaceId: "test-workspace" };
const channel = `/api/telegram-channels/${scope.channelId}`;
const post = `${channel}/managed-posts/test-post`;
const batch = `${channel}/managed-posts/reschedule-all-stream`;

test("ordinary local launch fails before it can spawn Prisma, Nest, Next or a tunnel", () => {
  for (const input of [
    "postgresql://user@production.example.test:5432/db",
    "postgresql://user@localhost:5432/db",
    "postgresql://user@localhost:5433/db?host=internal.example.test",
    "postgresql://user@localhost:5433/db?options=redirect",
  ]) {
    assert.throws(() => requireLocalDatabase({ DATABASE_URL: input }), /localhost:5433/u);
    const result = spawnSync(process.execPath, ["scripts/dev/dev-products.mjs", "nexeloq"], {
      env: { ...process.env, DATABASE_URL: input }, encoding: "utf8", timeout: 5_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No processes were started/u);
    assert.doesNotMatch(result.stdout, /migration|Starting/u);
    assert.ok(!result.stderr.includes(input));
  }
  const local = "postgresql://local@127.0.0.1:5433/test?schema=public";
  assert.equal(requireLocalDatabase({ DATABASE_URL: local }), local);
});

test("live startup requires activation and the operator requires a pinned TLS target", () => {
  for (const args of [["scripts/dev/dev-production.mjs", "ui"], ["scripts/dev/dev-production.mjs", "operator"], ["scripts/production/production-recovery.mjs"]]) {
    const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 5_000 });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /--live/u);
  }
  const endpoint = "ep-fixture.region.vendor.neon.tech";
  const input = `postgresql://tester:fixture@${endpoint}/app?sslmode=verify-full`;
  const profile = {
    OPERATOR_WORKSPACE_ID: scope.workspaceId, OPERATOR_CHANNEL_ID: scope.channelId, OPERATOR_USER_ID: scope.userId,
    DATABASE_URL_PRODUCTION: input, PRODUCTION_DATABASE_FINGERPRINT: "invalid",
  };
  assert.throws(() => operatorConfiguration(profile), /fingerprint/u);
  assert.throws(() => productionDatabaseFingerprint(input.replace("verify-full", "require")), /verify-full/u);
  assert.throws(() => productionDatabaseFingerprint(input + "&options=search_path%3Dother"), /verify-full/u);
  const fingerprint = createHash("sha256").update(`${endpoint}:5432/app`).digest("hex");
  assert.deepEqual(operatorConfiguration({ ...profile, PRODUCTION_DATABASE_FINGERPRINT: fingerprint }).scope, scope);
});

test("the Next child only receives explicit public web settings", () => {
  const env = productionWebEnvironment("operator", {
    PATH: "/fixture", DATABASE_URL: "db-fixture", JWT_SECRET: "jwt-fixture",
    BOT_TOKEN_ENCRYPTION_KEY: "encryption-fixture", NEXT_PUBLIC_LEAK: "public-fixture",
    RAILWAY_API_PROXY: "true", NODE_OPTIONS: "--require something",
  });
  assert.equal(env.NEXT_PUBLIC_API_URL, "/api");
  assert.equal(env.NEXT_PUBLIC_DATABASE_ENV, "production");
  assert.deepEqual(Object.keys(env).sort(), [
    "NEXT_PUBLIC_NEXELOQ_LIVE_MODE", "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_DATABASE_ENV",
    "NEXT_TELEMETRY_DISABLED", "NODE_ENV", "PATH",
  ].sort());
});

async function listen(server, port = 0) {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function withGateway(t, mode, handler, probeIdentity = async () => true) {
  const api = createServer(handler);
  const apiPort = await listen(api);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const gateway = createProductionGateway({
    mode, port, operatorPort: apiPort, productionOrigin: "https://mock.example.test",
    scope, capability: "mock-local-capability", probeIdentity,
    sendProduction: (url, options, callback) =>
      request(`http://127.0.0.1:${apiPort}${url.pathname}${url.search}`, { ...options, headers: { ...options.headers, "x-fixture-deployed": "1" } }, callback),
  });
  await listen(gateway, port);
  t.after(() => {
    gateway.closeAllConnections();
    api.closeAllConnections();
    gateway.close();
    api.close();
  });
  return `http://127.0.0.1:${port}`;
}

test("gateway forwards real HTTP verbs with bearer auth, exact confirmation and no ambient cookies", async (t) => {
  const seen = [];
  const origin = await withGateway(t, "ui", async (req, res) => {
    seen.push({ path: req.url, method: req.method, headers: req.headers });
    for await (const _chunk of req) { /* drain */ }
    res.writeHead(200, { "content-type": "application/json", "set-cookie": "fixture=private; Secure" });
    res.end('{"ok":true}');
  });
  const headers = { origin, authorization: "Bearer test.token", cookie: "fixture=private", "x-workspace-id": scope.workspaceId };
  const start = await fetch(origin + "/api/auth/login", {
    method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}",
  });
  assert.equal(start.status, 200);
  assert.equal(start.headers.get("set-cookie"), null);
  assert.equal(seen[0].headers.authorization, undefined);
  assert.equal(seen[0].headers.cookie, undefined);
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const path = method === "POST" ? `${post}/publish` : post;
    const result = await fetch(origin + path, {
      method,
      headers: {
        ...headers, "content-type": "application/json",
        "x-live-action-confirmation": `${method} ${scope.workspaceId} ${path}`,
      },
      ...(method === "GET" ? {} : { body: "{}" }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(seen.at(-1).headers.authorization, headers.authorization);
    assert.equal(seen.at(-1).headers["x-workspace-id"], scope.workspaceId);
    assert.equal(seen.at(-1).headers.cookie, undefined);
  }
  assert.deepEqual(seen.map(({ method }) => method), ["POST", "GET", "POST", "PATCH", "DELETE"]);
  for (const [path, method, extra, status] of [
    [post, "DELETE", { origin: "https://foreign.example.test" }, 403],
    [post, "DELETE", { "sec-fetch-site": "cross-site" }, 403],
    [post, "DELETE", {}, 428],
    [post, "GET", { authorization: "" }, 401],
    ["/api/telegram-channels/test-channel/recovery-transport", "POST", {}, 403],
    ["/api/telegram-channels/test-channel/%2Fother", "GET", {}, 400],
    [post + "?token=fixture", "GET", {}, 403],
  ]) {
    const result = await fetch(origin + path, { method, headers: { ...headers, ...extra } });
    assert.equal(result.status, status, path);
  }
  assert.equal(seen.length, 5);
});

test("SSE and NDJSON stream bytes before the upstream response completes", async (t) => {
  let release;
  const origin = await withGateway(t, "ui", (req, res) => {
    const sse = req.method === "GET";
    const frame = sse ? "data: fixture\n\n" : '{"type":"progress"}\n';
    res.writeHead(200, { "content-type": sse ? "text/event-stream" : "application/x-ndjson" });
    res.write(frame);
    release = () => res.end(frame);
  });
  for (const [method, path] of [
    ["GET", "/api/operations/notifications/events/stream"], ["POST", `${post}/publish-stream`],
  ]) {
    const result = await fetch(origin + path, {
      method,
      signal: AbortSignal.timeout(5_000),
      headers: {
        origin, authorization: "Bearer test.token", "x-workspace-id": scope.workspaceId,
        "content-type": "application/json", "x-live-action-confirmation": `${method} ${scope.workspaceId} ${path}`,
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    assert.equal(result.status, 200);
    const reader = result.body.getReader();
    const first = await reader.read();
    assert.match(Buffer.from(first.value).toString(), /fixture|progress/u);
    release();
    assert.equal((await reader.read()).done, false);
    assert.equal((await reader.read()).done, true);
  }
});

test("operator scopes browser reads and verifies named admission and an exact recovery batch", async (t) => {
  let lastRequest;
  const origin = await withGateway(t, "operator", (req, res) => {
    lastRequest = req;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      id: scope.channelId,
      adminLinks: [{ telegramUserAccountIntegration: { id: "account", username: "display", sessionEncrypted: "fixture", apiHashIv: "fixture" } }],
    }));
  }, async (authorization) => authorization === "Bearer named.owner");
  const headers = { origin, authorization: "Bearer named.owner", "x-workspace-id": scope.workspaceId };
  assert.equal((await fetch(origin + channel, { headers: { ...headers, authorization: "Bearer other.user" } })).status, 403);
  assert.equal((await fetch(origin + "/api/telegram-channels/other-channel", { headers })).status, 403);
  assert.equal((await fetch(origin + channel, { headers: { ...headers, "x-workspace-id": "other-workspace" } })).status, 403);
  assert.equal(lastRequest, undefined);
  const response = await fetch(origin + channel, { headers });
  const payload = await response.json();
  assert.deepEqual(payload.adminLinks[0].telegramUserAccountIntegration, { id: "account", username: "display" });
  for (const postIds of [[], ["different-post"], ["test-post"]]) {
    const res = await fetch(origin + batch, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "x-live-action-confirmation": `POST ${scope.workspaceId} ${batch} test-post` },
      body: JSON.stringify({ postIds }),
    });
    assert.equal(res.status, postIds[0] === "test-post" ? 200 : 428);
  }
  assert.equal(lastRequest.headers["x-local-operator-capability"], "mock-local-capability");
  assert.deepEqual(productionRoute("operator", "POST", new URL(origin + post + "/publish"), scope), { local: true, confirmation: true, revision: true });
  assert.equal(productionRoute("operator", "DELETE", new URL(origin + post), scope), undefined);
});

test("a failed upstream acknowledgement blocks replay for the same post", async (t) => {
  let requests = 0;
  const origin = await withGateway(t, "ui", (req, res) => {
    requests += 1;
    if (req.method === "POST") {
      req.socket.destroy();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end("{}");
  });
  const headers = { origin, authorization: "Bearer test.token", "x-workspace-id": scope.workspaceId };
  const publish = await fetch(origin + post + "/publish", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", "x-live-action-confirmation": `POST ${scope.workspaceId} ${post}/publish` },
    body: "{}",
  });
  assert.equal(publish.status, 502);
  const replay = await fetch(origin + post, {
    method: "DELETE",
    headers: { ...headers, "x-live-action-confirmation": `DELETE ${scope.workspaceId} ${post}` },
  });
  assert.equal(replay.status, 409);
  assert.equal((await fetch(origin + post, { headers })).status, 200);
  assert.equal(requests, 2);
});

test("an occupied internal Next port blocks the launcher before it exposes a gateway", async (t) => {
  const occupied = createServer();
  const port = await listen(occupied);
  t.after(() => occupied.close());
  const result = spawnSync(process.execPath, ["scripts/dev/dev-production.mjs", "ui", "--live", "--web-port", String(port - 1)], {
    encoding: "utf8", timeout: 5_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Production Next.js cannot start because port/u);
  assert.doesNotMatch(result.stdout, /LIVE ACTIONS/u);
});

test("operator login admits only the nominal owner and uses the pinned workspace", async (t) => {
  let statusUser = "other-user";
  const origin = await withGateway(t, "operator", (_req, res) => {
    assert.equal(_req.headers["x-workspace-id"], scope.workspaceId);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      accessToken: "ordinary-browser-fixture",
      user: { id: statusUser },
      workspace: { id: scope.workspaceId, access: { isOwner: true } },
    }));
  });
  const login = () => fetch(origin + "/api/auth/login", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}",
  });
  const wrongUser = await login();
  assert.equal(wrongUser.status, 403);
  assert.doesNotMatch(await wrongUser.text(), /ordinary-browser-fixture/u);
  statusUser = scope.userId;
  const owner = await login();
  assert.equal(owner.status, 200);
  assert.equal((await owner.json()).accessToken, "ordinary-browser-fixture");
});

test("operator sends normal and streamed publications only to localhost and checks revision confirmation first", async (t) => {
  const received = [];
  const origin = await withGateway(t, "operator", (req, res) => {
    received.push(req.headers);
    const stream = req.url.endsWith("-stream");
    res.writeHead(200, { "content-type": stream ? "application/x-ndjson" : "application/json" });
    res.end(stream ? '{"type":"complete","result":{"id":"fixture"}}\n' : '{"id":"fixture"}');
  });
  const revision = "2026-11-21T09:00:00.123Z";
  for (const suffix of ["publish", "publish-stream"]) {
    const path = post + "/" + suffix;
    const headers = { origin, authorization: "Bearer named.owner", "x-workspace-id": scope.workspaceId, "content-type": "application/json" };
    const submit = (extra) => fetch(origin + path, { method: "POST", body: "{}", headers: { ...headers, ...extra } });
    assert.equal((await submit({ "x-live-action-confirmation": `POST ${scope.workspaceId} ${path}` })).status, 428);
    const sent = await submit({ "x-operator-revision": revision, "x-live-action-confirmation": `POST ${scope.workspaceId} ${path} @${revision}` });
    assert.equal(sent.status, 200);
    assert.match(await sent.text(), /fixture/u);
  }
  assert.equal(received.length, 2);
  for (const entry of received) {
    assert.equal(entry["x-operator-revision"], revision);
    assert.equal(entry["x-local-operator-capability"], "mock-local-capability");
    assert.equal(entry["x-fixture-deployed"], undefined);
  }
  const placement = "/api/telegram-ad-sales/deal/placements/placement/publish";
  assert.deepEqual(productionRoute("operator", "POST", new URL(origin + placement), { ...scope, saleId: "deal", placementId: "placement" }),
    { local: true, confirmation: true, revision: true });
  assert.equal(productionRoute("operator", "POST", new URL(origin + placement), { ...scope, saleId: "deal", placementId: "other" }), undefined);
});
