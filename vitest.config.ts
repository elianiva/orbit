import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrationsPath = path.join(__dirname, "drizzle");
const migrations = await readD1Migrations(migrationsPath);

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      main: "./test/worker.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    exclude: ["test/render.test.ts"],
  },
}));
