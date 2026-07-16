#!/usr/bin/env bun
/**
 * Migrate an Obsidian vault → Orbit (R2 + D1).
 *
 * Usage:
 *   bun scripts/migrate-notes.ts                          # full migration
 *   bun scripts/migrate-notes.ts --source /other/vault    # custom source
 *   bun scripts/migrate-notes.ts --dry-run                # preview only
 *   bun scripts/migrate-notes.ts --sql ./migration.sql    # write SQL, skip upload
 */

import { readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, basename, extname, resolve, dirname } from "node:path";
import matter from "gray-matter";

// ── Args ───────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const sourceRoot = arg("--source")
  ? resolve(arg("--source")!)
  : resolve(import.meta.dir, "../../notes");

const dryRun = process.argv.includes("--dry-run");
const sqlPath = arg("--sql");
const R2_BUCKET = "orbit";
const PREVIEW_LEN = 200;

const PARA_MAP: Record<string, string> = {
  "00 - Maps of Contents": "mocs",
  "01 - Projects": "projects",
  "02 - Areas": "areas",
  "03 - Resources": "resources",
  "05 - Fleeting": "fleeting",
  "06 - Daily": "daily",
};

const SKIP_ROOT = new Set(["Templates", "Images", ".obsidian"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg"]);
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function wrangler(args: string[]): Promise<string> {
  const cmd = ["wrangler", ...args, "--remote"];
  if (dryRun) {
    console.log(`  [dry-run] ${cmd.join(" ")}`);
    return "";
  }
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr || `wrangler exited with code ${exitCode}`);
  }
  return stdout.trim();
}

// ── Path Transform ─────────────────────────────────────────────────────────

function toOrbitPath(file: string): string {
  const rel = relative(sourceRoot, file);
  const parts = rel.split("/");
  const prefix = PARA_MAP[parts[0]];

  if (!prefix) {
    return `misc/${slugify(basename(file, ".md"))}.md`;
  }

  if (prefix === "daily") {
    const year = parts[1];
    const month = parts[2]?.split("-")[0] ?? "01";
    const dateStr =
      basename(file, ".md").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? slugify(basename(file, ".md"));
    return `daily/${year}/${month}/${dateStr}.md`;
  }

  const subPath = parts.slice(1, -1).map(slugify);
  const slug = slugify(basename(file, ".md"));
  return `${[prefix, ...subPath, slug].join("/")}.md`;
}

// ── Content Transform ──────────────────────────────────────────────────────

function transformContent(content: string): string {
  let out = content;
  out = out.replace(/<%[\s\S]*?%>/g, "");
  out = out.replace(/```datacore[\s\S]*?```/g, "");
  out = out.replace(/!\[\[([^\]]+?)\]\]/g, (_m, ref: string) => {
    const filename = ref.split("/").pop() ?? ref;
    return `![image](/images/${filename})`;
  });
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

// ── Frontmatter Extract ────────────────────────────────────────────────────

function extractFrontmatter(
  data: Record<string, unknown>,
  orbitPath: string,
): { tags: string[]; frontmatter: Record<string, unknown> } {
  const tags = Array.isArray(data.tags) ? [...data.tags].map(String) : [];
  const fm: Record<string, unknown> = {};

  if (data.created_at != null) {
    fm.created_at =
      data.created_at instanceof Date
        ? data.created_at.toISOString().split("T")[0]
        : String(data.created_at);
  }
  if (data.source != null) fm.source = data.source;
  if (data.difficulty != null) fm.difficulty = data.difficulty;
  if (data.author != null) fm.author = data.author;
  if (data.description != null) fm.description = data.description;
  fm.para_category = orbitPath.split("/")[1];
  fm.origin = "obsidian";

  return { tags, frontmatter: fm };
}

// ── File Walking ───────────────────────────────────────────────────────────

function walkMd(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    if (SKIP_ROOT.has(entry) && dir === sourceRoot) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkMd(full));
    } else if (entry.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

function walkImages(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkImages(full));
    } else if (IMAGE_EXTS.has(extname(entry).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

// ── Concurrency ───────────────────────────────────────────────────────────

const PARALLEL = Number(arg("--parallel")) || 5;

async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log(`Source: ${sourceRoot}\n`);
console.log(`Parallel: ${PARALLEL}\n`);

const imageFiles = walkImages(sourceRoot);
const mdFiles = walkMd(sourceRoot);
const notes: Array<{
  orbitPath: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  size: number;
  createdAt: Date;
}> = [];

for (const file of mdFiles) {
  const raw = await Bun.file(file).text();
  const { data, content } = matter(raw);
  const orbitPath = toOrbitPath(file);
  const title = basename(file, ".md");
  const transformed = transformContent(content);
  const size = Buffer.byteLength(transformed, "utf-8");
  const { tags, frontmatter } = extractFrontmatter(data, orbitPath);

  let createdAt: Date;
  if (data.created_at) {
    createdAt = new Date(String(data.created_at));
    if (isNaN(createdAt.getTime())) createdAt = statSync(file).mtime;
  } else {
    createdAt = statSync(file).mtime;
  }

  notes.push({ orbitPath, title, content: transformed, frontmatter, tags, size, createdAt });
}

notes.sort((a, b) => a.orbitPath.localeCompare(b.orbitPath));

// ── Summary ────────────────────────────────────────────────────────────────

const byCategory: Record<string, number> = {};
for (const n of notes) {
  const cat = n.orbitPath.split("/")[1];
  byCategory[cat] = (byCategory[cat] || 0) + 1;
}

console.log(`${notes.length} notes + ${imageFiles.length} images`);
for (const [cat, count] of Object.entries(byCategory)) {
  console.log(`  ${cat}: ${count}`);
}
console.log();

if (dryRun) {
  process.exit(0);
}

// ── Build SQL ──────────────────────────────────────────────────────────────

let sql = `-- Orbit Migration: Obsidian Vault → D1\n`;
sql += `-- Generated: ${new Date().toISOString()}\n`;
sql += `-- Notes: ${notes.length}\n\n`;

for (const n of notes) {
  const fm = JSON.stringify(n.frontmatter).replace(/'/g, "''");
  const tags = JSON.stringify(n.tags).replace(/'/g, "''");
  const preview = n.content.slice(0, PREVIEW_LEN).replace(/'/g, "''");
  const title = n.title.replace(/'/g, "''");
  const ts = Math.floor(n.createdAt.getTime() / 1000);

  sql += `INSERT OR REPLACE INTO nodes `;
  sql += `(id, path, title, frontmatter, tags, content_preview, mime_type, size, content_hash, created_at, updated_at) `;
  sql += `VALUES ('${n.orbitPath.replace(/'/g, "''")}', '${n.orbitPath.replace(/'/g, "''")}', '${title}', `;
  sql += `'${fm}', '${tags}', '${preview}', `;
  sql += `'text/markdown', ${n.size}, '', ${ts}, ${ts});\n`;
}

// If --sql, write to specified path and exit
if (sqlPath) {
  await Bun.write(resolve(sqlPath), sql);
  console.log(`SQL written to ${sqlPath}`);
  console.log(`Run: wrangler d1 execute orbit --remote --file=${sqlPath}`);
  process.exit(0);
}

// ── Upload ─────────────────────────────────────────────────────────────────

const staging = join(tmpdir(), `orbit-migration-${Date.now()}`);
mkdirSync(join(staging, "images"), { recursive: true });

for (const note of notes) {
  const dest = join(staging, note.orbitPath);
  mkdirSync(dirname(dest), { recursive: true });
  await Bun.write(dest, note.content);
}
for (const img of imageFiles) {
  await Bun.write(join(staging, "images", basename(img)), Bun.file(img));
}

// Images
console.log(`=== Images (${imageFiles.length}) ===`);
const imageResults = await concurrentMap(imageFiles, async (img) => {
  const name = basename(img);
  const mime = MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
  try {
    await wrangler([
      "r2",
      "object",
      "put",
      `${R2_BUCKET}/images/${name}`,
      `--file=${join(staging, "images", name)}`,
      `--content-type=${mime}`,
    ]);
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err}`);
    return false;
  }
});
const imageOk = imageResults.filter(Boolean).length;
console.log(`  ${imageOk}/${imageFiles.length}\n`);

// Notes
console.log(`=== Notes (${notes.length}) ===`);
const noteResults = await concurrentMap(notes, async (note) => {
  try {
    await wrangler([
      "r2",
      "object",
      "put",
      `${R2_BUCKET}/${note.orbitPath}`,
      `--file=${join(staging, note.orbitPath)}`,
      "--content-type=text/markdown",
    ]);
    console.log(`  ✓ ${note.orbitPath}`);
    return true;
  } catch (err) {
    console.error(`  ✗ ${note.orbitPath}: ${err}`);
    return false;
  }
});
const noteOk = noteResults.filter(Boolean).length;
console.log(`  ${noteOk}/${notes.length}\n`);

// D1
const d1sql = join(staging, "migration.sql");
await Bun.write(d1sql, sql);

console.log("=== D1 ===");
try {
  const result = await wrangler(["d1", "execute", "orbit", `--file=${d1sql}`]);
  if (result) console.log(result);
} catch (err) {
  console.error(`  ✗ ${err}`);
}

// Cleanup
rmSync(staging, { recursive: true, force: true });

console.log(`\nDone! ${noteOk} notes + ${imageOk} images.`);
