import { Context, Data, Effect, Layer, Schema } from "effect";
import { sql } from "drizzle-orm";

import { Database } from "./client";

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

export const SearchServiceLive: Layer.Layer<SearchService, never, Database> = Layer.effect(
  SearchService,
  Effect.gen(function* () {
    const { db } = yield* Database;

    const search = Effect.fn("search")(function* (query: string, limit = 20) {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.all<SearchResult>(
            sql`SELECT n.id, n.path, n.title,
                   highlight(nodes_fts, 2, '<mark>', '</mark>') AS snippet,
                   rank
            FROM nodes_fts
            JOIN nodes n ON n.rowid = nodes_fts.rowid
            WHERE nodes_fts MATCH ${query}
            ORDER BY rank
            LIMIT ${limit}`,
          ),
        catch: (cause) => new SearchError({ cause, query }),
      });
      return result;
    });

    return SearchService.of({ search });
  }),
);

export class SearchError extends Data.TaggedError("SearchError")<{
  readonly cause: unknown;
  readonly query: string;
}> {}
