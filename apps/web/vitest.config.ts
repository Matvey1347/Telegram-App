import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    css: false,
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "../../products/**/*.{test,spec}.{ts,tsx}",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@finance-web": path.resolve(__dirname, "../standalone/finance/web/src"),
      "@consumer-finance/web/components": path.resolve(
        __dirname,
        "../../products/finance/web/components",
      ),
      "@consumer-finance/web/lib": path.resolve(
        __dirname,
        "../../products/finance/web/lib",
      ),
      "@consumer-finance/web/provider": path.resolve(
        __dirname,
        "../../products/finance/web/provider",
      ),
    },
  },
});
