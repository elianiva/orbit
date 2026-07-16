import { assert, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Database, DatabaseLive } from "~/server/db/client";
import { SearchService, SearchServiceLive } from "~/server/db/search";
import { EmbeddingService } from "~/server/embedding";
import { VectorizeService } from "~/server/vectorize";
import { nodes } from "~/server/db/schema";

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
  MockEmbedding,
  MockVectorize,
  SearchServiceLive.pipe(
    Layer.provide(DatabaseLive),
    Layer.provide(MockEmbedding),
    Layer.provide(MockVectorize),
  ),
);

layer(TestLayer)("search", (it) => {
  it.effect("insert nodes and search returns ranked results with highlights", () =>
    Effect.gen(function* () {
      const { db } = yield* Database;
      const search = yield* SearchService;

      yield* Effect.tryPromise({
        try: () =>
          db.insert(nodes).values({
            id: "search-1",
            path: "typescript.md",
            title: "TypeScript Tips",
            contentPreview: "Use Effect for typed error handling in TypeScript",
            tags: ["typescript", "effect"],
            frontmatter: {},
            mimeType: "text/markdown",
            size: 100,
            contentHash: "hash1",
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        catch: (e) => new Error(String(e)),
      });

      const results = yield* search.search("Effect");

      assert.isAbove(results.length, 0);
      assert.strictEqual(results[0].title, "TypeScript Tips");
      assert.include(results[0].snippet, "<mark>");
    }),
  );

  it.effect("no matches returns empty array", () =>
    Effect.gen(function* () {
      const search = yield* SearchService;
      const results = yield* search.search("zzzznonexistent");

      assert.strictEqual(results.length, 0);
    }),
  );

  it.effect("limit parameter caps results", () =>
    Effect.gen(function* () {
      const { db } = yield* Database;
      const search = yield* SearchService;

      for (let i = 0; i < 5; i++) {
        yield* Effect.tryPromise({
          try: () =>
            db.insert(nodes).values({
              id: `limit-${i}`,
              path: `doc-${i}.md`,
              title: `Document ${i}`,
              contentPreview: `Content about testing document number ${i}`,
              tags: ["test"],
              frontmatter: {},
              mimeType: "text/markdown",
              size: 50,
              contentHash: `hash-${i}`,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          catch: (e) => new Error(String(e)),
        });
      }

      const results = yield* search.search("test", 2);

      assert.isAbove(results.length, 0);
      assert.isAtMost(results.length, 2);
    }),
  );
});
