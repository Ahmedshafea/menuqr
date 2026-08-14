import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const phase42PostgresProfile = process.env.PHASE42_PG_TEST === "1";

if (phase42PostgresProfile) {
  const sessionPoolerUrl = process.env.PHASE42_STAGING_DIRECT_URL;

  if (!sessionPoolerUrl) {
    throw new Error("PHASE42_STAGING_DIRECT_URL is required for the Phase 4.2 PostgreSQL test profile");
  }

  const parsed = new URL(sessionPoolerUrl);
  const authorizedProject = "mgqqupsmseumyhjouoog";
  const authorizedHost = "aws-0-eu-west-2.pooler.supabase.com";

  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== authorizedHost ||
    parsed.port !== "5432" ||
    !parsed.username.includes(authorizedProject)
  ) {
    throw new Error("Phase 4.2 PostgreSQL test profile rejected an unauthorized database target");
  }

  process.env.DATABASE_URL = sessionPoolerUrl;
  process.env.DIRECT_URL = sessionPoolerUrl;
}

const postgresIntegration = ["PHASE21_PG_TEST", "PHASE23_PG_TEST", "PHASE241_PG_TEST", "PHASE42_PG_TEST"]
  .some((name) => process.env[name] === "1");

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    fileParallelism: !postgresIntegration,
    ...(postgresIntegration ? { maxWorkers: 1, testTimeout: 30_000 } : {}),
  },
  resolve: {
    alias: [
      ...(phase42PostgresProfile
        ? [{ find: "@/lib/prisma", replacement: path.resolve(__dirname, "./src/test/prisma-phase42.ts") }]
        : []),
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: "server-only", replacement: path.resolve(__dirname, "./src/test/server-only.ts") },
    ],
  },
});
