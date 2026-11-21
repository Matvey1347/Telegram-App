import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { matchesOperatorIdentity, productionRoute, validId } from "./dev-production-policy.mjs";

const bodyLimit = 8 * 1024 * 1024;
const forwardedRequestHeaders = [
  "accept", "authorization", "content-type", "content-length",
  "x-workspace-id", "x-correlation-id", "x-bypass-response-cache",
];
const forwardedResponseHeaders = ["content-type", "x-correlation-id", "content-disposition"];

function error(res, status, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ message }));
}

async function readBody(stream) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > bodyLimit) throw new Error("Body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const publicAccountFields = new Set(["id", "username", "firstName", "lastName", "photoUrl"]);

function stripIntegrationFields(parentKey, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    parentKey === "telegramUserAccountIntegration" ? publicAccountFields.has(key)
      : !/encrypted|(?:authTag|accessHash|apiHash|webhookSecret|botToken|phoneCodeHash|session|Iv)$/iu.test(key),
  ));
}

function confirmedTarget(req, workspace, path, payload, route) {
  if (!validId(workspace)) return false;
  let suffix = "";
  if (route.batch) {
    if (!Array.isArray(payload.postIds) || !payload.postIds.length ||
      payload.postIds.length > (route.single ? 1 : 100) || !payload.postIds.every(validId) ||
      new Set(payload.postIds).size !== payload.postIds.length) return false;
    suffix = ` ${payload.postIds.join(",")}`;
  }
  if (route.revision) {
    const revision = req.headers["x-operator-revision"];
    if (typeof revision !== "string" || !/^\d{4}-\d\d-\d\dT[0-9:.]+Z(?:\/\d{4}-\d\d-\d\dT[0-9:.]+Z)?$/u.test(revision)) return false;
    suffix += ` @${revision}`;
  }
  return req.headers["x-live-action-confirmation"] === `${req.method} ${workspace} ${path}${suffix}`;
}

function proxyWeb(req, res, nextPort) {
  const upstream = httpRequest({
    hostname: "127.0.0.1", port: nextPort, path: req.url,
    method: req.method, headers: req.headers,
  }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.on("error", () => res.destroy());
    response.pipe(res);
  });
  upstream.on("error", () => error(res, 502, "Local Next.js is starting"));
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}

export function createProductionGateway({ mode, port, nextPort, productionOrigin, scope, operatorPort, capability, probeIdentity, sendProduction = httpsRequest }) {
  const host = `127.0.0.1:${port}`;
  const origin = `http://${host}`;
  const unresolvedPosts = new Set();
  const gateway = createServer(async (req, res) => {
    if (req.headers.host !== host) return error(res, 403, "Invalid local host");
    if (!req.url?.startsWith("/") || req.url.startsWith("//") ||
      req.url.split("?")[0].split("/").some((segment) => [".", ".."].includes(segment)) ||
      /[%\\]/u.test(req.url.split("?")[0]) && req.url.startsWith("/api")) {
      return error(res, 400, "Invalid path");
    }
    let url;
    try {
      url = new URL(req.url, origin);
    } catch {
      return error(res, 400, "Invalid path");
    }
    if (url.origin !== origin) return error(res, 400, "Invalid origin");
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return proxyWeb(req, res, nextPort);
    const crossSite = req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin";
    if (crossSite || (req.headers.origin && req.headers.origin !== origin) ||
      (req.method !== "GET" && req.headers.origin !== origin)) {
      return error(res, 403, "Open the local production UI and retry");
    }
    const route = productionRoute(mode, req.method, url, scope);
    if (!route) return error(res, 403, "This action is outside the configured live workflow or object scope");
    if (!route.login && !/^Bearer [A-Za-z0-9._~-]+$/u.test(req.headers.authorization ?? "")) {
      return error(res, 401, "Sign in to production");
    }
    const workspace = mode === "operator" ? scope.workspaceId : req.headers["x-workspace-id"];
    if (mode === "operator" && !route.shell && !route.login &&
      req.headers["x-workspace-id"] !== workspace) {
      return error(res, 403, "Select the configured production workspace");
    }
    if (mode === "operator" && !route.login) {
      try {
        if (!await probeIdentity(req.headers.authorization)) return error(res, 403, "Operator identity or workspace admission denied");
      } catch {
        return error(res, 502, "Production operator admission is unavailable");
      }
    }
    let body;
    let singlePost;
    if (req.method !== "GET") {
      if (!/^application\/json(?:\s*;|$)/iu.test(req.headers["content-type"] ?? "") &&
        !(req.method === "DELETE" && !req.headers["content-length"])) {
        return error(res, 415, "Expected JSON");
      }
      try {
        body = await readBody(req);
        const payload = JSON.parse(body.length ? body.toString("utf8") : "{}");
        if (route.confirmation && !confirmedTarget(req, workspace, url.pathname, payload, route)) {
          return error(res, 428, "Confirm the exact workspace and action in the production banner session");
        }
        if (route.single) singlePost = payload.postIds[0];
      } catch {
        return error(res, 400, "Invalid or oversized JSON");
      }
    }
    // At most one UI mutation in flight per workspace/post. Keep the target
    // blocked if the deployed API never supplies a definitive acknowledgement.
    const postTarget = url.pathname.split("/").slice(0, 6).join("/");
    const targetKey = singlePost ? `${url.pathname.split("/").slice(0, 5).join("/")}/${singlePost}` : postTarget;
    const reconciliation = url.pathname.endsWith("/reconcile-published");
    const actionKey = route.confirmation ? `${workspace} ${targetKey}${reconciliation ? " reconcile" : ""}` : undefined;
    if (actionKey && (unresolvedPosts.has(actionKey) || unresolvedPosts.size >= 1_000)) {
      return error(res, 409, "A live action for this target is in flight or unresolved. Check production and Telegram evidence before retrying.");
    }
    if (actionKey) unresolvedPosts.add(actionKey);
    const target = route.local ? `http://127.0.0.1:${operatorPort}` : productionOrigin;
    const targetPath = route.scopedList ? `/api/telegram-channels/${scope.channelId}` : url.pathname;
    const headers = Object.fromEntries(forwardedRequestHeaders.filter((key) => req.headers[key]).map((key) => [key, req.headers[key]]));
    if (mode === "operator") headers["x-workspace-id"] = workspace;
    if (mode === "operator" && req.method === "GET") headers["x-bypass-response-cache"] = "1";
    if (route.local) {
      headers["x-local-operator-capability"] = capability;
      if (route.revision) headers["x-operator-revision"] = req.headers["x-operator-revision"];
    }
    if (route.login) delete headers.authorization;
    if (body) headers["content-length"] = body.length;
    const upstream = (route.local ? httpRequest : sendProduction)(new URL(targetPath + (route.scopedList ? "" : url.search), target), {
      method: req.method, headers, timeout: 60_000,
    }, async (response) => {
      upstream.setTimeout(0); // SSE/NDJSON can remain open while the client is connected.
      try {
        if (response.statusCode >= 300 && response.statusCode < 400) {
          response.resume();
          return error(res, 502, "Unexpected production API redirect");
        }
        const resultHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
        for (const key of forwardedResponseHeaders) {
          if (response.headers[key]) resultHeaders[key] = response.headers[key];
        }
        const success = response.statusCode >= 200 && response.statusCode < 300;
        if (mode === "operator" && route.login && success) {
          const session = JSON.parse((await readBody(response)).toString("utf8"));
          if (!matchesOperatorIdentity(session, scope)) {
            return error(res, 403, "Operator identity or workspace admission denied");
          }
          res.writeHead(response.statusCode, resultHeaders);
          return res.end(JSON.stringify(session));
        }
        const scopedWorkspaces = mode === "operator" && url.pathname === "/api/workspaces";
        if (success && (route.sanitize || scopedWorkspaces || route.saleRead)) {
          let value = JSON.parse((await readBody(response)).toString("utf8"));
          if (route.saleRead) {
            value = { ...value, placements: value.placements?.filter((placement) =>
              placement.id === scope.placementId && placement.telegramChannelId === scope.channelId) ?? [] };
          }
          if (scopedWorkspaces) value = value.filter((entry) => entry.id === scope.workspaceId);
          if (route.scopedList) {
            value = url.pathname.endsWith("/select")
              ? [{
                  id: value.id, title: value.title, username: value.username,
                  telegramChatId: value.telegramChatId, photoUrl: value.photoUrl,
                  presentationIconPresentation: value.presentationIconPresentation,
                  currentSubscribersCount: value.currentSubscribersCount,
                  timePosts: value.timePosts, publishingCapabilities: value.publishingCapabilities,
                  canPostMessages: Boolean(value.publishingCapabilities?.source),
                }]
              : {
                items: [value],
                pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
                counts: { active: value.isTest ? 0 : 1, test: value.isTest ? 1 : 0, archived: 0 },
              };
          }
          res.writeHead(response.statusCode, resultHeaders);
          return res.end(JSON.stringify(value, stripIntegrationFields));
        }
        if (!/^(?:application\/(?:[\w.+-]*json|octet-stream)|text\/event-stream)(?:\s*;|$)/iu.test(response.headers["content-type"] ?? "") &&
          ![204, 205].includes(response.statusCode)) {
          response.resume();
          return error(res, 502, "Unexpected production API response type");
        }
        if (actionKey) {
          const ndjson = /^application\/(?:x-)?ndjson\b/iu.test(response.headers["content-type"] ?? "");
          let tail = "";
          let completed = !ndjson;
          if (ndjson) {
            response.on("data", (chunk) => {
              const lines = (tail + chunk.toString("utf8")).split("\n");
              tail = (lines.pop() ?? "").slice(-65_536);
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const event = JSON.parse(line);
                  completed = event.type === "complete" &&
                    !event.result?.failedCount && !event.result?.skippedCount;
                } catch {
                  completed = false;
                }
              }
            });
          }
          res.once("finish", () => {
            const rejected = [400, 401, 403, 404, 412, 422].includes(response.statusCode);
            if ((success && completed) || rejected) unresolvedPosts.delete(actionKey);
            if (success && completed && reconciliation) unresolvedPosts.delete(`${workspace} ${targetKey}`);
          });
        }
        res.writeHead(response.statusCode, resultHeaders);
        response.on("error", () => res.destroy());
        response.pipe(res);
      } catch {
        error(res, 502, "Production API returned an invalid response");
      }
    });
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => error(res, 502, "Production API connection failed. Check the outcome before retrying."));
    res.on("close", () => upstream.destroy());
    upstream.end(body);
  });

  gateway.on("upgrade", (req, socket, head) => {
    if (req.headers.host !== host || req.headers.origin !== origin ||
      !req.url?.split("?")[0].endsWith("/webpack-hmr") ||
      !req.url.startsWith("/_next/")) return socket.destroy();
    const upstream = httpRequest({ hostname: "127.0.0.1", port: nextPort, path: req.url, headers: req.headers });
    upstream.on("upgrade", (response, nextSocket, nextHead) => {
      const headers = response.rawHeaders.reduce((lines, value, index, source) =>
        index % 2 === 0 ? lines + `${value}: ${source[index + 1]}\r\n` : lines, "");
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n`);
      if (head.length) nextSocket.write(head);
      if (nextHead.length) socket.write(nextHead);
      socket.pipe(nextSocket).pipe(socket);
      socket.on("error", () => nextSocket.destroy());
      nextSocket.on("error", () => socket.destroy());
      socket.on("close", () => nextSocket.destroy());
      nextSocket.on("close", () => socket.destroy());
    });
    upstream.on("response", (response) => { response.resume(); socket.destroy(); });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  return gateway;
}
