import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { addEqualityTesters } from "@effect/vitest";

addEqualityTesters();

await applyD1Migrations(env.ORBIT_DB, (env as unknown as { TEST_MIGRATIONS: any }).TEST_MIGRATIONS);
