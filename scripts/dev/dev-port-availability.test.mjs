import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { assertPortAvailable } from "./dev-port-availability.mjs";

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("rejects a port occupied on IPv4", async () => {
  const server = createServer();
  const port = await listen(server, "127.0.0.1");

  try {
    await assert.rejects(
      assertPortAvailable(port, "Frontend"),
      new RegExp(
        `Frontend cannot start because port ${port} is already in use`,
      ),
    );
  } finally {
    await close(server);
  }
});

test("rejects a port occupied on IPv6", async (context) => {
  const server = createServer();
  let port;

  try {
    port = await listen(server, "::1");
  } catch (error) {
    if (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT") {
      context.skip("IPv6 loopback is unavailable");
      return;
    }
    throw error;
  }

  try {
    await assert.rejects(
      assertPortAvailable(port, "Frontend"),
      new RegExp(
        `Frontend cannot start because port ${port} is already in use`,
      ),
    );
  } finally {
    await close(server);
  }
});

test("rejects a port occupied by an IPv6 wildcard dev server", async (context) => {
  const server = createServer();
  let port;

  try {
    port = await listen(server, "::");
  } catch (error) {
    if (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT") {
      context.skip("IPv6 wildcard binding is unavailable");
      return;
    }
    throw error;
  }

  try {
    await assert.rejects(
      assertPortAvailable(port, "Frontend"),
      new RegExp(
        `Frontend cannot start because port ${port} is already in use`,
      ),
    );
  } finally {
    await close(server);
  }
});
