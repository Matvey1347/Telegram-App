import assert from "node:assert/strict";
import test from "node:test";
import { extractCloudflareQuickTunnelUrl } from "./dev-cloudflare-tunnel.mjs";

test("extracts the generated quick tunnel hostname", () => {
  assert.equal(
    extractCloudflareQuickTunnelUrl(
      "INF + https://quiet-river-tree.trycloudflare.com +",
    ),
    "https://quiet-river-tree.trycloudflare.com",
  );
});

test("does not mistake the Cloudflare API endpoint for a tunnel", () => {
  assert.equal(
    extractCloudflareQuickTunnelUrl(
      'failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": context deadline exceeded',
    ),
    null,
  );
});
