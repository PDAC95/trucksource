import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Integration tests (tests/integration/**) hit Supabase Staging with the anon key.
// Surface .env.local into process.env so the anon client can be constructed; if the
// vars are absent (e.g. CI without secrets) the integration suites self-skip.
const env = loadEnv("", process.cwd(), "");

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // 'server-only' throws when imported outside an RSC module; under Vitest
      // (jsdom) we import server modules directly to unit-test their logic, so
      // alias it to a no-op. The real RSC boundary is still enforced at build.
      "server-only": path.resolve(
        process.cwd(),
        "tests/stubs/server-only.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
    ],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      // TEST-ONLY: lets integration suites create confirmed user fixtures and
      // verify default-deny audit rows (Staging has email-confirm ON, so anon
      // signUp users cannot password-sign-in). RLS gates themselves are always
      // asserted via anon/authenticated clients — never the service role.
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    },
  },
});
