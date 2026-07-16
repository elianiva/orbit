import { createHash } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import { eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import { Database } from "~/server/db/client";
import { chunkContent, MAX_CHUNKS, PREVIEW_LENGTH } from "~/server/chunking";
import { nodes } from "~/server/db/schema";
import { EmbeddingService } from "~/server/embedding";
import { R2Service } from "~/server/storage/r2-service";
import { VectorizeService } from "~/server/vectorize";

import { NoteDbError, NoteNotFoundError, NoteValidationError } from "./errors";

const generateId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

const MAX_CONTENT_SIZE = 1024 * 1024;
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface NoteCreateInput {
  readonly content: string;
  readonly language?: string;
  readonly ttl?: number;
}

export interface NoteResult {
  readonly id: string;
  readonly path: string;
  readonly frontmatter: Record<string, unknown>;
  readonly contentPreview: string;
  readonly size: number;
  readonly createdAt: Date;
}

export interface NoteServiceShape {
  readonly create: (
    input: NoteCreateInput,
  ) => Effect.Effect<
    NoteResult,
    NoteValidationError | NoteDbError,
    EmbeddingService | VectorizeService
  >;
  readonly read: (
    path: string,
  ) => Effect.Effect<
    { readonly node: NoteResult; readonly content: string },
    NoteNotFoundError | NoteDbError
  >;
  readonly list: () => Effect.Effect<readonly NoteResult[], NoteDbError>;
  readonly delete: (path: string) => Effect.Effect<void, NoteDbError, VectorizeService>;
}

export class NoteService extends Context.Service<NoteService, NoteServiceShape>()(
  "orbit/NoteService",
) {}

function isExpired(frontmatter: Record<string, unknown>, now: Date): boolean {
  const ttl = frontmatter.ttl;
  const createdAt = frontmatter.created_at;
  if (typeof ttl !== "number" || ttl <= 0) return false;
  if (typeof createdAt !== "string") return false;
  const expiresAt = new Date(new Date(createdAt).getTime() + ttl * 1000);
  return now > expiresAt;
}

function toNoteResult(row: {
  id: string;
  path: string;
  frontmatter: Record<string, unknown>;
  contentPreview: string;
  size: number;
  createdAt: Date;
}): NoteResult {
  return {
    id: row.id,
    path: row.path,
    frontmatter: row.frontmatter,
    contentPreview: row.contentPreview,
    size: row.size,
    createdAt: row.createdAt,
  };
}
function indexNote(
  path: string,
  title: string,
  content: string,
): Effect.Effect<void, never, EmbeddingService | VectorizeService> {
  return Effect.gen(function* () {
    const embedding = yield* EmbeddingService;
    const vectorize = yield* VectorizeService;

    const chunks = chunkContent(content);
    const texts = chunks.map((c) => (title ? `${title}\n\n${c}` : c));

    const vectors = yield* embedding
      .embedBatch(texts)
      .pipe(Effect.catchTag("EmbeddingError", () => Effect.succeed([])));
    if (vectors.length === 0) return;

    yield* vectorize
      .upsert(
        vectors.map((values: number[], i: number) => ({
          id: `${path}#${i}`,
          values,
          namespace: path.split("/")[0],
          metadata: {
            path,
            title,
            chunkIndex: i,
            totalChunks: chunks.length,
            preview: chunks[i].slice(0, PREVIEW_LENGTH),
          },
        })),
      )
      .pipe(Effect.catchTag("VectorizeError", () => Effect.void));
  });
}

function removeNoteIndex(path: string): Effect.Effect<void, never, VectorizeService> {
  return Effect.gen(function* () {
    const vectorize = yield* VectorizeService;
    const prefix = createHash("sha256").update(path).digest("hex").slice(0, 16);
    const ids = Array.from({ length: MAX_CHUNKS }, (_, i) => `${prefix}#${i}`);
    yield* vectorize.deleteByIds(ids).pipe(Effect.catchTag("VectorizeError", () => Effect.void));
  });
}

export const NoteServiceLive: Layer.Layer<
  NoteService,
  never,
  Database | R2Service | EmbeddingService | VectorizeService
> = Layer.effect(
  NoteService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const r2 = yield* R2Service;

    const create = Effect.fn("note.create")(function* (input: NoteCreateInput) {
      const content = input.content.trim();

      if (!content) {
        return yield* new NoteValidationError({ reason: "empty" });
      }

      const size = new TextEncoder().encode(content).length;
      if (size > MAX_CONTENT_SIZE) {
        return yield* new NoteValidationError({ reason: "oversize" });
      }

      const id = generateId();
      const path = id;
      const language = input.language || "auto";
      const now = new Date();

      const frontmatter: Record<string, unknown> = {
        language,
        created_at: now.toISOString(),
      };

      if (input.ttl !== undefined && input.ttl > 0) {
        frontmatter.ttl = input.ttl;
      } else if (input.ttl === undefined) {
        frontmatter.ttl = DEFAULT_TTL_SECONDS;
      }

      yield* r2
        .put(path, content, "text/plain")
        .pipe(Effect.mapError((cause) => new NoteDbError({ cause })));

      yield* Effect.tryPromise({
        try: () =>
          db.insert(nodes).values({
            id,
            path,
            title: "",
            frontmatter,
            tags: [],
            contentPreview: content.slice(0, PREVIEW_LENGTH),
            mimeType: "text/plain",
            size,
            contentHash: "",
            createdAt: now,
            updatedAt: now,
          }),
        catch: (cause) => new NoteDbError({ cause }),
      });

      yield* indexNote(path, "", content);

      return toNoteResult({
        id,
        path,
        frontmatter,
        contentPreview: content.slice(0, PREVIEW_LENGTH),
        size,
        createdAt: now,
      });
    });

    const read = Effect.fn("note.read")(function* (path: string) {
      const row = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(nodes)
            .where(eq(nodes.path, path))
            .then((rows) => rows[0] ?? null),
        catch: (cause) => new NoteDbError({ cause }),
      });

      if (!row) {
        return yield* new NoteNotFoundError({ path });
      }

      if (isExpired(row.frontmatter as Record<string, unknown>, new Date())) {
        return yield* new NoteNotFoundError({ path });
      }

      const content = yield* r2.get(row.path).pipe(
        Effect.mapError((cause) => new NoteDbError({ cause })),
        Effect.map((obj) => obj ?? ""),
      );

      return {
        node: toNoteResult(row),
        content,
      };
    });

    const list = Effect.fn("note.list")(function* () {
      const now = new Date();
      const rows = yield* Effect.tryPromise({
        try: () => db.select().from(nodes).orderBy(nodes.createdAt),
        catch: (cause) => new NoteDbError({ cause }),
      });

      return rows
        .filter((row) => !isExpired(row.frontmatter as Record<string, unknown>, now))
        .map(toNoteResult);
    });

    const deleteNote = Effect.fn("note.delete")(function* (path: string) {
      const row = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ id: nodes.id })
            .from(nodes)
            .where(eq(nodes.path, path))
            .then((rows) => rows[0] ?? null),
        catch: (cause) => new NoteDbError({ cause }),
      });

      if (!row) return;

      yield* removeNoteIndex(path);

      yield* Effect.tryPromise({
        try: () => db.delete(nodes).where(eq(nodes.path, path)),
        catch: (cause) => new NoteDbError({ cause }),
      });

      yield* r2.delete(path).pipe(Effect.mapError((cause) => new NoteDbError({ cause })));
    });

    return NoteService.of({ create, read, list, delete: deleteNote });
  }),
);
