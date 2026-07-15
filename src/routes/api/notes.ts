import { Effect } from "effect";
import { createFileRoute } from "@tanstack/react-router";

import { NoteService } from "~/features/vault/lib/service";
import { getRuntime } from "~/server/app-runtime";

interface NoteCreateRequest {
  content?: string;
  language?: string;
  ttl?: number;
}

export const Route = createFileRoute("/api/notes")({
  server: {
    handlers: {
      GET: async () => {
        const runtime = getRuntime();
        return runtime.runPromise(
          Effect.gen(function* () {
            const noteService = yield* NoteService;
            const notes = yield* noteService.list();
            return Response.json(
              notes.map((n) => ({
                id: n.id,
                path: n.path,
                contentPreview: n.contentPreview,
                size: n.size,
                createdAt: n.createdAt,
              })),
            );
          }).pipe(
            Effect.catchTag("NoteDbError", () =>
              Effect.succeed(Response.json({ error: "Failed to list notes" }, { status: 500 })),
            ),
          ),
        );
      },
      POST: async ({ request }: { request: Request }) => {
        const body = (await request.json()) as NoteCreateRequest;

        if (!body.content || typeof body.content !== "string") {
          return Response.json({ error: "Content is required" }, { status: 400 });
        }
        const content = body.content;

        const runtime = getRuntime();
        return runtime.runPromise(
          Effect.gen(function* () {
            const noteService = yield* NoteService;
            const result = yield* noteService.create({
              content,
              language: body.language,
              ttl: body.ttl,
            });
            return Response.json({ id: result.id, path: result.path }, { status: 201 });
          }).pipe(
            Effect.catchTag("NoteValidationError", (err) =>
              Effect.succeed(
                Response.json(
                  {
                    error:
                      err.reason === "empty" ? "Content is required" : "Content exceeds 1MB limit",
                  },
                  { status: err.reason === "empty" ? 400 : 413 },
                ),
              ),
            ),
            Effect.catchTag("NoteDbError", () =>
              Effect.succeed(Response.json({ error: "Failed to create note" }, { status: 500 })),
            ),
          ),
        );
      },
    },
  },
});
