import { Effect } from "effect";
import { createFileRoute } from "@tanstack/react-router";

import { NoteService } from "~/features/vault/lib/service";
import { getRuntime } from "~/server/app-runtime";

export const Route = createFileRoute("/api/notes/$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        const runtime = getRuntime();
        return runtime.runPromise(
          Effect.gen(function* () {
            const noteService = yield* NoteService;
            const { node, content } = yield* noteService.read(`notes/${params.id}`);
            return Response.json({
              id: node.id,
              path: node.path,
              content,
              frontmatter: node.frontmatter,
              size: node.size,
              createdAt: node.createdAt,
            });
          }).pipe(
            Effect.catchTag("NoteNotFoundError", () =>
              Effect.succeed(Response.json({ error: "Note not found" }, { status: 404 })),
            ),
            Effect.catchTag("NoteDbError", () =>
              Effect.succeed(Response.json({ error: "Failed to read note" }, { status: 500 })),
            ),
          ),
        );
      },
    },
  },
});
