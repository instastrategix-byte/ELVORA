import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Backend boundary: UI components and shared helpers may use backend schemas, types and
  // server actions, but never services, database clients, env or HTTP internals at runtime.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    ignores: ["src/components/layout/header-session.tsx"], // async Server Component
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@backend/db/*",
                "@backend/core/*",
                "@backend/http/*",
                "@backend/auth/*",
                "@backend/modules/*/service",
                "@backend/modules/billing/*",
              ],
              allowTypeImports: true,
              message: "Server-only backend code. Call the API (src/lib/api-client.ts) or import types only.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "backend/supabase/**",
  ]),
]);

export default eslintConfig;
