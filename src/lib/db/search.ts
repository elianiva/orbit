import { Context, Effect, Layer } from "effect";
import { sql } from "drizzle-orm";

import { Database } from "../runtime";

export interface SearchResult {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly snippet: string;
  readonly rank: number;
}

export interface SearchService {
  readonly search: (query: string, limit?: number) => Effect.Effect<SearchResult[], SearchError>;
}

export class SearchService extends Context.Service<
  SearchService,
  {
    readonly search: (query: string, limit?: number) => Effect.Effect<SearchResult[], SearchError>;
  }
>()("orbit/SearchService") {}

export const SearchServiceLive: Layer.Layer<SearchService, never, Database> = Layer.effect(
  SearchService,
  Effect.gen(function* () {
    const { db } = yield* Database;

    return {
      search: (query: string, limit = 20) =>
        Effect.tryPromise({
          try: () =>
            db.all<{
              id: string;
              path: string;
              title: string;
              snippet: string;
              rank: number;
            }>(
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
        }),
    };
  }),
);

export class SearchError extends Error {
  readonly _tag = "SearchError" as const;
  constructor(args: { readonly cause: unknown; readonly query: string }) {
    super(`Search failed for "${args.query}": ${String(args.cause)}`);
  }
}
