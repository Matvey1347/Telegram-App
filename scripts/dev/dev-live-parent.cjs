const { spawnSync } = require("node:child_process");

// The gateway owns these development processes even if pnpm or its terminal
// exits before the launcher has time to run its signal handlers.
if (process.connected) {
  process.once("disconnect", () => {
    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/pid", String(process.pid), "/t", "/f"], {
        stdio: "ignore", windowsHide: true, timeout: 5_000,
      });
    } else {
      try {
        process.kill(-process.pid, "SIGTERM");
      } catch {
        // A framework child can share its parent's process group.
      }
    }
    process.exit(0);
  });
}

const { resolve } = require("node:path");
process.argv.splice(1, 1);
require(resolve(process.argv[1]));
