import { createServer } from "node:net";

const LOCAL_PORT_HOSTS = ["127.0.0.1", "::1"];
const UNSUPPORTED_ADDRESS_CODES = new Set(["EADDRNOTAVAIL", "EAFNOSUPPORT"]);

function probePort(port, host) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, host, () => server.close(resolve));
  });
}

export async function assertPortAvailable(port, name) {
  for (const host of LOCAL_PORT_HOSTS) {
    try {
      await probePort(port, host);
    } catch (error) {
      if (host === "::1" && UNSUPPORTED_ADDRESS_CODES.has(error.code)) {
        continue;
      }
      if (error.code === "EADDRINUSE") {
        throw new Error(
          `${name} cannot start because port ${port} is already in use. Stop the existing local process and run this command again.`,
        );
      }
      throw error;
    }
  }
}
