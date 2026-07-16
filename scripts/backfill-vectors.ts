#!/usr/bin/env bun
/**
 * Backfill Vectorize index from D1 + R2.
 *
 * Uses the same chunking logic as the runtime service (src/server/chunking.ts).
 * Tracks content_hash in D1 to skip already-indexed notes.
 * Reads OAuth token from wrangler config — no env vars needed.
 *
 * Usage:
 *   bun scripts/backfill-vectors.ts                      # index notes missing vectors
 *   bun scripts/backfill-vectors.ts --force              # reindex everything
 *   bun scripts/backfill-vectors.ts --dry-run            # preview only
 *   bun scripts/backfill-vectors.ts --path notes/abc     # index specific note
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { chunkContent, PREVIEW_LENGTH } from "../src/server/chunking";

// ── Args ───────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const filterPath = arg("--path");

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
const DB_ID = "590e35ae-c3c2-4de9-8856-1f59e142255b";
const INDEX_NAME = "orbit-search";
const EMBED_MODEL = "@cf/baai/bge-m3";
const EMBED_BATCH = 50;
const BATCH_DELAY_MS = 200;

// ── CF API helpers ─────────────────────────────────────────────────────────

async function cfFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface D1Row {
  id: string;
  path: string;
  title: string;
  content_hash: string;
}

async function d1Query(sql: string): Promise<D1Row[]> {
  const result = await cfFetch<Array<{ results: D1Row[] }>>(`/d1/database/${DB_ID}/query`, {
    method: "POST",
    body: JSON.stringify({ sql }),
  });
  return result[0]?.results ?? [];
}

async function d1Execute(sql: string): Promise<void> {
  await cfFetch(`/d1/database/${DB_ID}/query`, {
    method: "POST",
    body: JSON.stringify({ sql }),
  });
}

async function r2Get(key: string): Promise<string> {
  const tmpFile = `/tmp/orbit-r2-${Date.now()}`;
  const proc = Bun.spawn(
    ["wrangler", "r2", "object", "get", `orbit/${key}`, `--file=${tmpFile}`, "--remote"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`R2 get failed for ${key}: ${stderr || exitCode}`);
  }
  return Bun.file(tmpFile).text();
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const result = await cfFetch<{ shape: number[]; data: number[][] }>(`/ai/run/${EMBED_MODEL}`, {
    method: "POST",
    body: JSON.stringify({ text: texts }),
  });
  return result.data;
}

interface VectorizeUpsertVector {
  id: string;
  values: number[];
  namespace: string;
  metadata: Record<string, unknown>;
}

async function vectorizeUpsert(vectors: VectorizeUpsertVector[]): Promise<void> {
  await cfFetch(`/vectorize/v2/indexes/${INDEX_NAME}/vectors`, {
    method: "POST",
    body: JSON.stringify({ vectors }),
  });
}

// ── Core indexing logic ────────────────────────────────────────────────────

interface IndexResult {
  path: string;
  chunks: number;
  skipped: boolean;
  error?: string;
}

async function indexNote(row: D1Row, forceReindex: boolean): Promise<IndexResult> {
  try {
    const r2Key = row.id.startsWith("notes/") ? row.id : `notes/${row.id}`;
    const content = await r2Get(r2Key);
    const hash = createHash("sha256").update(content).digest("hex");

    if (!forceReindex && row.content_hash === hash) {
      return { path: row.path, chunks: 0, skipped: true };
    }

    if (dryRun) {
      const chunks = chunkContent(content);
      return { path: row.path, chunks: chunks.length, skipped: false };
    }

    const chunks = chunkContent(content);
    const title = row.title || "";
    const texts = chunks.map((c) => (title ? `${title}\n\n${c}` : c));

    const allVectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const vecs = await embedBatch(batch);
      allVectors.push(...vecs);
      if (i + EMBED_BATCH < texts.length) await delay(BATCH_DELAY_MS);
    }

    const vectors: VectorizeUpsertVector[] = allVectors.map((values, i) => ({
      id: `${row.path}#${i}`,
      values,
      namespace: row.path.split("/")[0],
      metadata: {
        path: row.path,
        title,
        chunkIndex: i,
        totalChunks: chunks.length,
        preview: chunks[i].slice(0, PREVIEW_LENGTH),
      },
    }));

    for (let i = 0; i < vectors.length; i += 1000) {
      await vectorizeUpsert(vectors.slice(i, i + 1000));
    }

    await d1Execute(
      `UPDATE nodes SET content_hash = '${hash}' WHERE id = '${row.id.replace(/'/g, "''")}'`,
    );

    return { path: row.path, chunks: chunks.length, skipped: false };
  } catch (err) {
    return {
      path: row.path,
      chunks: 0,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log(`Account: ${ACCOUNT_ID}`);
console.log(`Mode: ${dryRun ? "dry-run" : force ? "force reindex" : "incremental"}`);
if (filterPath) console.log(`Filter: ${filterPath}`);
console.log();

let whereClause = "";
if (filterPath) {
  whereClause = `WHERE path = '${filterPath.replace(/'/g, "''")}'`;
} else if (!force) {
  whereClause = `WHERE content_hash = '' OR content_hash IS NULL`;
}

const rows = await d1Query(`SELECT id, path, title, content_hash FROM nodes ${whereClause}`);

if (rows.length === 0) {
  console.log("Nothing to index.");
  process.exit(0);
}

console.log(`${rows.length} notes to process\n`);

let indexed = 0;
let skipped = 0;
let errors = 0;

for (const row of rows) {
  const result = await indexNote(row, force);
  if (result.error) {
    console.log(`  ✗ ${result.path}: ${result.error}`);
    errors++;
  } else if (result.skipped) {
    skipped++;
  } else {
    console.log(`  ✓ ${result.path} (${result.chunks} chunks)`);
    indexed++;
  }
}

console.log(`\nDone. ${indexed} indexed, ${skipped} skipped, ${errors} errors.`);
