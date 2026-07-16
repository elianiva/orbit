import { Context, Data, Effect, Layer, Schema } from "effect";
import { sql } from "drizzle-orm";

import { Database } from "./client";
import { EmbeddingService } from "~/server/embedding";
import { VectorizeService } from "~/server/vectorize";

export const SearchResult = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  title: Schema.String,
  snippet: Schema.String,
  rank: Schema.Number,
});
export type SearchResult = typeof SearchResult.Type;

export interface SearchServiceShape {
  readonly search: (query: string, limit?: number) => Effect.Effect<SearchResult[], SearchError>;
}

export class SearchService extends Context.Service<SearchService, SearchServiceShape>()(
  "orbit/SearchService",
) {}

interface FtsRow {
  id: string;
  path: string;
  title: string;
  snippet: string;
  rank: number;
}

interface MergedResult {
  id: string;
  path: string;
  title: string;
  snippet: string;
  ftsScore: number;
  vectorScore: number;
}

const VECTOR_ALPHA = 0.6;

export const SearchServiceLive: Layer.Layer<
  SearchService,
  never,
  Database | VectorizeService | EmbeddingService
> = Layer.effect(
  SearchService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const vectorize = yield* VectorizeService;
    const embedding = yield* EmbeddingService;

    const search = Effect.fn("search")(function* (query: string, limit = 20) {
      const fetchLimit = limit * 3;

      const ftsRows = yield* Effect.tryPromise({
        try: () =>
          db.all<FtsRow>(
            sql`SELECT n.id, n.path, n.title,
                   highlight(nodes_fts, 2, '<mark>', '</mark>') AS snippet,
                   rank
            FROM nodes_fts
            JOIN nodes n ON n.rowid = nodes_fts.rowid
            WHERE nodes_fts MATCH ${query}
            ORDER BY rank
            LIMIT ${fetchLimit}`,
          ),
        catch: (cause) => new SearchError({ cause, query }),
      });

      const vectorResults = yield* embedding.embed(query).pipe(
        Effect.flatMap((vec) => vectorize.query(vec, { topK: fetchLimit })),
        Effect.catchTag("EmbeddingError", () => Effect.succeed([])),
        Effect.catchTag("VectorizeError", () => Effect.succeed([])),
      );

      const merged = new Map<string, MergedResult>();

      for (const row of ftsRows) {
        const score = 1 / (1 + Math.abs(row.rank));
        merged.set(row.path, {
          id: row.id,
          path: row.path,
          title: row.title,
          snippet: row.snippet,
          ftsScore: score,
          vectorScore: 0,
        });
      }

      for (const vec of vectorResults) {
        const similarity = 1 / (1 + vec.score);
        const existing = merged.get(vec.metadata.path);
        if (existing) {
          existing.vectorScore = similarity;
        } else {
          merged.set(vec.metadata.path, {
            id: vec.metadata.path.split("/").pop() ?? vec.metadata.path,
            path: vec.metadata.path,
            title: vec.metadata.title,
            snippet: vec.metadata.preview,
            ftsScore: 0,
            vectorScore: similarity,
          });
        }
      }

      return [...merged.values()]
        .sort(
          (a, b) =>
            VECTOR_ALPHA * b.vectorScore +
            (1 - VECTOR_ALPHA) * b.ftsScore -
            (VECTOR_ALPHA * a.vectorScore + (1 - VECTOR_ALPHA) * a.ftsScore),
        )
        .slice(0, limit)
        .map(({ ftsScore, vectorScore, ...rest }) => ({
          ...rest,
          rank: VECTOR_ALPHA * vectorScore + (1 - VECTOR_ALPHA) * ftsScore,
        }));
    });

    return SearchService.of({ search });
  }),
);

export class SearchError extends Data.TaggedError("SearchError")<{
  readonly cause: unknown;
  readonly query: string;
}> {}
