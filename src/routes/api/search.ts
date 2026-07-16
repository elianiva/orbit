import { Effect } from "effect";
import { createFileRoute } from "@tanstack/react-router";

import { SearchService } from "~/server/db/search";
import { getRuntime } from "~/server/app-runtime";

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q");

        if (!q || q.trim().length === 0) {
          return Response.json({ results: [] });
        }

        const runtime = getRuntime();
        return runtime.runPromise(
          Effect.gen(function* () {
            const search = yield* SearchService;
            const results = yield* search.search(q.trim());
            return Response.json({ results });
          }).pipe(
            Effect.catchTag("SearchError", () =>
              Effect.succeed(Response.json({ error: "Search failed" }, { status: 500 })),
            ),
          ),
        );
      },
    },
  },
});
