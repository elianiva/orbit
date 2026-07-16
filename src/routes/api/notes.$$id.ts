import { Effect } from "effect";
import { createFileRoute } from "@tanstack/react-router";

import { NoteService } from "~/features/vault/lib/service";
import { getRuntime } from "~/server/app-runtime";

export const Route = createFileRoute("/api/notes/$$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string[] } }) => {
        const runtime = getRuntime();
        return runtime.runPromise(
          Effect.gen(function* () {
            const noteService = yield* NoteService;
            const { node, content } = yield* noteService.read(params.id.join("/"));
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
      PATCH: async ({ request, params }: { request: Request; params: { id: string[] } }) => {
        const path = Array.isArray(params?.id)
          ? params.id.join("/")
          : new URL(request.url).pathname
              .replace("/api/notes/", "")
              .split("/")
              .filter(Boolean)
              .join("/");
        const data = (await request.json()) as Record<string, unknown>;
        const moveTo = data.moveTo;

        if (typeof moveTo !== "string" || !moveTo.trim()) {
          return Response.json({ error: "moveTo path is required" }, { status: 400 });
        }

        const runtime = getRuntime();
        return runtime.runPromise(
          Effect.gen(function* () {
            const noteService = yield* NoteService;
            const result = yield* noteService.move(path, moveTo.trim());
            return Response.json({
              id: result.id,
              path: result.path,
              size: result.size,
            });
          }).pipe(
            Effect.catchTag("NoteNotFoundError", () =>
              Effect.succeed(Response.json({ error: "Note not found" }, { status: 404 })),
            ),
            Effect.catchTag("NoteDbError", () =>
              Effect.succeed(Response.json({ error: "Failed to move note" }, { status: 500 })),
            ),
          ),
        );
      },
      DELETE: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const segments = url.pathname.replace("/api/notes/", "").split("/").filter(Boolean);
        const path = segments.join("/");

        const runtime = getRuntime();
        return runtime.runPromise(
          Effect.gen(function* () {
            const noteService = yield* NoteService;
            yield* noteService.delete(path);
            return new Response(null, { status: 204 });
          }).pipe(
            Effect.catchTag("NoteDbError", () =>
              Effect.succeed(Response.json({ error: "Failed to delete note" }, { status: 500 })),
            ),
          ),
        );
      },
      PUT: async ({ request, params }: { request: Request; params: { id: string[] } }) => {
        const path = params.id.join("/");
        const data = (await request.json()) as Record<string, unknown>;
        const content = data.content;
        const title = data.title;

        if (typeof content !== "string" || !content.trim()) {
          return Response.json({ error: "Content is required" }, { status: 400 });
        }

        const runtime = getRuntime();
        return runtime.runPromise(
          Effect.gen(function* () {
            const noteService = yield* NoteService;
            const result = yield* noteService.write({
              path,
              content,
              ...(typeof title === "string" ? { title } : {}),
            });
            return Response.json(
              { id: result.id, path: result.path, size: result.size },
              { status: 201 },
            );
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
            Effect.catchTag("NoteNotAllowedError", (err) =>
              Effect.succeed(Response.json({ error: err.reason }, { status: 403 })),
            ),
            Effect.catchTag("NoteDbError", () =>
              Effect.succeed(Response.json({ error: "Failed to write note" }, { status: 500 })),
            ),
          ),
        );
      },
    },
  },
});
