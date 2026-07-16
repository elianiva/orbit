import { assert, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { Database, DatabaseLive } from "~/server/db/client";
import { EmbeddingService } from "~/server/embedding";
import { VectorizeService } from "~/server/vectorize";
import { nodes } from "~/server/db/schema";
import { R2Service, R2ServiceLive } from "~/server/storage/r2-service";
import { NoteService, NoteServiceLive } from "~/features/vault/lib/service";
import { NoteNotFoundError, NoteValidationError } from "~/features/vault/lib/errors";

const MockEmbedding = Layer.succeed(EmbeddingService, {
  embed: () => Effect.succeed([]),
  embedBatch: () => Effect.succeed([]),
});
const MockVectorize = Layer.succeed(VectorizeService, {
  upsert: () => Effect.succeed(undefined),
  query: () => Effect.succeed([]),
  deleteByIds: () => Effect.succeed(undefined),
});
const TestLayer = Layer.mergeAll(
  DatabaseLive,
  R2ServiceLive,
  MockEmbedding,
  MockVectorize,
  NoteServiceLive.pipe(
    Layer.provide(DatabaseLive),
    Layer.provide(R2ServiceLive),
    Layer.provide(MockEmbedding),
    Layer.provide(MockVectorize),
  ),
);

layer(TestLayer)("note service", (it) => {
  it.effect("create and read round-trip", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;

      const created = yield* note.create({
        content: "hello world",
        language: "markdown",
      });

      assert.strictEqual(created.path, created.id);
      assert.strictEqual(created.frontmatter.language, "markdown");
      assert.strictEqual(created.frontmatter.ttl, 604800);
      assert.ok(created.size > 0);

      const { node, content } = yield* note.read(created.path);
      assert.strictEqual(content, "hello world");
      assert.strictEqual(node.id, created.id);
    }),
  );

  it.effect("create with ttl: 0 means never expire", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;

      const created = yield* note.create({
        content: "permanent note",
        ttl: 0,
      });

      assert.strictEqual(created.frontmatter.ttl, undefined);

      const { content } = yield* note.read(created.path);
      assert.strictEqual(content, "permanent note");
    }),
  );

  it.effect("create with custom ttl", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;

      const created = yield* note.create({
        content: "custom ttl",
        ttl: 3600,
      });

      assert.strictEqual(created.frontmatter.ttl, 3600);
    }),
  );

  it.effect("create rejects empty content", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;

      const result = yield* note.create({ content: "" }).pipe(Effect.flip);

      assert.instanceOf(result, NoteValidationError);
      assert.strictEqual(result.reason, "empty");
    }),
  );

  it.effect("create rejects whitespace-only content", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;

      const result = yield* note.create({ content: "   \n  " }).pipe(Effect.flip);

      assert.instanceOf(result, NoteValidationError);
      assert.strictEqual(result.reason, "empty");
    }),
  );

  it.effect("read returns NoteNotFoundError for nonexistent path", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;

      const result = yield* note.read("nonexistent").pipe(Effect.flip);

      assert.instanceOf(result, NoteNotFoundError);
    }),
  );

  it.effect("read returns NoteNotFoundError for expired note", () =>
    Effect.gen(function* () {
      const { db } = yield* Database;
      const note = yield* NoteService;

      // Insert a note with TTL that already expired
      const id = "expired-test";
      const path = id;
      const past = new Date(Date.now() - 100000);
      yield* Effect.tryPromise({
        try: () =>
          db.insert(nodes).values({
            id,
            path,
            title: "",
            frontmatter: {
              language: "auto",
              ttl: 1,
              created_at: past.toISOString(),
            },
            tags: [],
            contentPreview: "expired",
            mimeType: "text/plain",
            size: 7,
            contentHash: "",
            createdAt: past,
            updatedAt: past,
          }),
        catch: (e) => new Error(String(e)),
      });

      const result = yield* note.read(path).pipe(Effect.flip);

      assert.instanceOf(result, NoteNotFoundError);
    }),
  );

  it.effect("delete removes note from D1 and R2", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;
      const r2 = yield* R2Service;

      const created = yield* note.create({
        content: "to be deleted",
        ttl: 0,
      });

      // Verify it exists
      const { content } = yield* note.read(created.path);
      assert.strictEqual(content, "to be deleted");

      // Delete it
      yield* note.delete(created.path);

      // Verify it's gone from D1
      const result = yield* note.read(created.path).pipe(Effect.flip);
      assert.instanceOf(result, NoteNotFoundError);

      // Verify it's gone from R2
      const r2Content = yield* r2.get(created.id);
      assert.strictEqual(r2Content, null);
    }),
  );

  it.effect("delete is idempotent for nonexistent path", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;

      // Should not throw
      yield* note.delete("does-not-exist");
    }),
  );

  it.effect("create stores content in R2", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;
      const r2 = yield* R2Service;

      const created = yield* note.create({
        content: "r2 test content",
        language: "plaintext",
        ttl: 0,
      });

      const r2Content = yield* r2.get(created.id);
      assert.strictEqual(r2Content, "r2 test content");
    }),
  );

  it.effect("create generates correct content preview", () =>
    Effect.gen(function* () {
      const note = yield* NoteService;

      const longContent = "a".repeat(300);
      const created = yield* note.create({
        content: longContent,
        ttl: 0,
      });

      assert.strictEqual(created.contentPreview.length, 200);
      assert.strictEqual(created.contentPreview, "a".repeat(200));
    }),
  );
});
