import assert from "node:assert/strict";
import test from "node:test";
import {
  localBotPublicEnvironment,
  railwayPublicEnvironment,
  railwayPublicOrigin,
} from "./public-origin-environment.mjs";

test("normalizes Railway's public domain to one HTTPS origin", () => {
  assert.equal(
    railwayPublicOrigin("telegram-system.example.com/path"),
    "https://telegram-system.example.com",
  );
});

test("derives Railway web, API callback, and webhook topology without product URLs", () => {
  const result = railwayPublicEnvironment("telegram-system.example.com", {});
  assert.deepEqual(result, {
    publicOrigin: "https://telegram-system.example.com",
    values: {
      API_PUBLIC_URL: "https://telegram-system.example.com",
      FRONTEND_URL: "https://telegram-system.example.com",
    },
  });
});

test("preserves explicit canonical Railway topology values", () => {
  const result = railwayPublicEnvironment("gateway.example.com", {
    API_PUBLIC_URL: "https://api.example.com/",
    FRONTEND_URL: "https://app.example.com/",
  });
  assert.deepEqual(result?.values, {
    API_PUBLIC_URL: "https://api.example.com/",
    FRONTEND_URL: "https://app.example.com/",
  });
});

test("maps a dev tunnel to generic public origins for both bot runtimes", () => {
  assert.deepEqual(
    localBotPublicEnvironment("https://random-tunnel.example.com/path"),
    {
      API_PUBLIC_URL: "https://random-tunnel.example.com",
      FRONTEND_URL: "https://random-tunnel.example.com",
    },
  );
});

test("rejects missing or non-HTTP public origins", () => {
  assert.equal(railwayPublicEnvironment("", {}), null);
  assert.throws(() => localBotPublicEnvironment("file:///tmp/app"));
});
