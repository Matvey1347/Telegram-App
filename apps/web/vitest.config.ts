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
      "@finance-pro/web/components": path.resolve(
        __dirname,
        "../../products/finance-pro/web/components",
      ),
      "@finance-pro/web/lib": path.resolve(
        __dirname,
        "../../products/finance-pro/web/lib",
      ),
      "@finance-pro/web/provider": path.resolve(
        __dirname,
        "../../products/finance-pro/web/provider",
      ),
      "@greeter/web/components": path.resolve(
        __dirname,
        "../../products/greeter/web/components",
      ),
      "@greeter/web/lib": path.resolve(
        __dirname,
        "../../products/greeter/web/lib",
      ),
    },
  },
});
