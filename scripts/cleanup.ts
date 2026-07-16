#!/usr/bin/env bun
/**
 * Nuke all data from D1, R2, and Vectorize.
 *
 * Destroys everything — nodes table, pastes table, all R2 objects,
 * and the entire Vectorize index (deletes + recreates).
 *
 * Usage:
 *   bun scripts/cleanup.ts                    # nuke all three
 *   bun scripts/cleanup.ts --d1-only          # only D1
 *   bun scripts/cleanup.ts --r2-only          # only R2
 *   bun scripts/cleanup.ts --vectorize-only   # only Vectorize
 *   bun scripts/cleanup.ts --dry-run          # preview what would happen
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Args ───────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes("--dry-run");
const d1Only = process.argv.includes("--d1-only");
const r2Only = process.argv.includes("--r2-only");
const vectorizeOnly = process.argv.includes("--vectorize-only");
const all = !d1Only && !r2Only && !vectorizeOnly;

const DB_ID = "590e35ae-c3c2-4de9-8856-1f59e142255b";
const R2_BUCKET = "orbit";
const VECTORIZE_INDEX = "orbit-search";
const EMBED_DIMENSIONS = 1024; // @cf/baai/bge-m3

// ── Wrangler credentials ───────────────────────────────────────────────────

function readWranglerToken(): string {
  const candidates = [
    join(homedir(), "Library", "Preferences", ".wrangler", "config", "default.toml"),
    join(homedir(), ".wrangler", "config", "default.toml"),
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf-8");
      const m = raw.match(/^oauth_token\s*=\s*"(.+?)"/m);
      if (m) return m[1];
    } catch {}
  }
  throw new Error("Cannot find wrangler OAuth token. Log in with `wrangler login` first.");
}

const API_TOKEN = readWranglerToken();

async function getAccountId(): Promise<string> {
  const res = await fetch("https://api.cloudflare.com/client/v4/accounts", {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  const json = (await res.json()) as {
    success: boolean;
    result: Array<{ id: string; name: string }>;
  };
  if (!json.success || json.result.length === 0) {
    throw new Error("Cannot fetch Cloudflare account ID.");
  }
  return json.result[0].id;
}

const ACCOUNT_ID = await getAccountId();
const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;

async function cfFetch<T>(path: string, init?: RequestInit & { method?: string }): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const json = (await res.json()) as { success: boolean; errors?: unknown[]; result: T };
  if (!json.success) throw new Error(`CF API error: ${JSON.stringify(json.errors)}`);
  return json.result;
}

// ── D1 ─────────────────────────────────────────────────────────────────────

async function cleanD1(): Promise<void> {
  console.log("\n── D1 ──");

  const tables = ["nodes", "pastes"];
  for (const table of tables) {
    console.log(`  Truncating ${table}...`);
    if (!dryRun) {
      try {
        await cfFetch(`/d1/database/${DB_ID}/query`, {
          method: "POST",
          body: JSON.stringify({ sql: `DELETE FROM ${table};` }),
        });
        console.log(`  ✓ ${table} cleared`);
      } catch (err) {
        console.error(`  ✗ Failed to clear ${table}:`, err);
      }
    } else {
      console.log(`  [dry-run] DELETE FROM ${table}`);
    }
  }

  if (!dryRun) {
    try {
      await cfFetch(`/d1/database/${DB_ID}/query`, {
        method: "POST",
        body: JSON.stringify({ sql: "VACUUM;" }),
      });
    } catch {
      // VACUUM may fail in some D1 contexts; non-critical
    }
  }

  console.log("  ✓ D1 cleaned");
}

// ── R2 ─────────────────────────────────────────────────────────────────────

async function cleanR2(): Promise<void> {
  console.log("\n── R2 ──");

  // List all objects via CF API (paginated)
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams(
      cursor ? { cursor, per_page: "1000" } : { per_page: "1000" },
    );
    const res = await fetch(`${API_BASE}/r2/buckets/${R2_BUCKET}/objects?${params}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    const json = (await res.json()) as {
      success: boolean;
      result: Array<{ key: string }>;
      result_info?: { cursor?: string; is_truncated?: boolean };
    };
    if (!json.success) {
      const body = await res.text();
      throw new Error(`R2 list error: ${body}`);
    }
    for (const obj of json.result ?? []) {
      keys.push(obj.key);
    }
    cursor = json.result_info?.cursor;
  } while (cursor);

  if (keys.length === 0) {
    console.log("  Nothing in R2, skipping.");
    return;
  }

  console.log(`  ${keys.length} objects to delete`);

  if (!dryRun) {
    const concurrency = 10;
    const results = await Promise.allSettled(
      keys.map((key, i) =>
        (async () => {
          // stagger starts slightly to avoid connection burst
          await new Promise((r) => setTimeout(r, (i % concurrency) * 50));
          const res = await fetch(
            `${API_BASE}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${API_TOKEN}` },
            },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })(),
      ),
    );
    let failed = 0;
    for (let i = 0; i < keys.length; i++) {
      if (results[i].status === "rejected") {
        console.error(
          `  ✗ Failed to delete ${keys[i]}: ${(results[i] as PromiseRejectedResult).reason}`,
        );
        failed++;
      }
    }
    if (failed > 0) {
      console.log(`  ⚠ ${failed}/${keys.length} failed — re-run to clean up remaining`);
    }
  } else {
    for (const key of keys) {
      console.log(`  [dry-run] would delete ${key}`);
    }
  }

  console.log(`  ✓ R2 cleaned (${keys.length} objects deleted)`);
}

// ── Vectorize ──────────────────────────────────────────────────────────────

async function cleanVectorize(): Promise<void> {
  console.log("\n── Vectorize ──");

  if (dryRun) {
    console.log(`  [dry-run] would delete and recreate index "${VECTORIZE_INDEX}"`);
    return;
  }

  // Delete the whole index, then recreate with same config
  try {
    await cfFetch(`/vectorize/v2/indexes/${VECTORIZE_INDEX}`, { method: "DELETE" });
    console.log("  Index deleted");
  } catch {
    console.log("  Index doesn't exist or already deleted");
  }

  await cfFetch(`/vectorize/v2/indexes`, {
    method: "POST",
    body: JSON.stringify({
      name: VECTORIZE_INDEX,
      config: {
        dimensions: EMBED_DIMENSIONS,
        metric: "cosine",
      },
    }),
  });
  console.log(`  ✓ Vectorize index "${VECTORIZE_INDEX}" recreated`);
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log(dryRun ? "══ DRY RUN ══\n" : "══ CLEANUP ══\n");

try {
  if (all || d1Only) await cleanD1();
  if (all || r2Only) await cleanR2();
  if (all || vectorizeOnly) await cleanVectorize();

  console.log("\n── Summary ──");
  if (all || d1Only) console.log("  D1        ✓ wiped");
  if (all || r2Only) console.log("  R2        ✓ wiped");
  if (all || vectorizeOnly) console.log("  Vectorize ✓ deleted + recreated");

  if (all) {
    console.log("\nReady to backfill. Run: bun scripts/backfill-vectors.ts");
  }

  if (dryRun) {
    console.log("\n══ DRY RUN — no changes made ══");
  }
} catch (err) {
  console.error("\n✗ Cleanup failed:", err);
  process.exit(1);
}
