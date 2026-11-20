import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@backend": fileURLToPath(new URL("./backend/src", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    // Component tests opt into jsdom with `// @vitest-environment jsdom`.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}", "backend/tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    // DB suites apply every migration to PGlite in beforeAll; that grows with each migration.
    hookTimeout: 120_000,
  },
});
