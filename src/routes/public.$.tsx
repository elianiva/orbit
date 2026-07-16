import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { z } from "zod";

import { NoteService } from "~/features/vault/lib/service";
import { RenderService } from "~/features/render/lib/service";
import { getRuntime } from "~/server/app-runtime";

const getPublicNote = createServerFn()
  .validator(z.object({ path: z.string() }))
  .handler(async ({ data }) => {
    const runtime = getRuntime();
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const ns = yield* NoteService;
        const rs = yield* RenderService;
        const { node, content } = yield* ns.read(data.path);
        const rendered = yield* rs.toHtml(content);

        const fm = rendered.frontmatter as Record<string, unknown> | null;
        if (!fm?.published) return null;

        const title = (fm.title as string) || node.path;
        const tags = fm.tags as string[] | undefined;
        const date =
          node.createdAt instanceof Date
            ? node.createdAt.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : node.createdAt;

        return { title, html: rendered.html, tags: tags ?? null, date, path: node.path };
      }).pipe(
        Effect.catchTag("NoteNotFoundError", () => Effect.succeed(null)),
        Effect.catchTag("NoteDbError", () => Effect.succeed(null)),
        Effect.catchTag("RenderError", () => Effect.succeed(null)),
        Effect.catch(() => Effect.succeed(null)),
      ),
    );

    return result;
  });

export const Route = createFileRoute("/public/$")({
  loader: async ({ params }) => getPublicNote({ data: { path: params._splat ?? "" } }),
  component: PublicNotePage,
});

function PublicNotePage() {
  const data = Route.useLoaderData();

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <h1 className="text-6xl font-bold tracking-tight text-muted-foreground">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">note not found or not public</p>

      </div>
    );
  }

  const { title, html, tags, date } = data;

  return (
    <div className="mx-auto max-w-3xl min-h-screen px-4 py-8 bg-background">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {date && <time dateTime={date}>{date}</time>}
          {tags && tags.length > 0 && (
            <span className="flex items-center gap-1.5">
              {tags.map((tag: string) => (
                <span key={tag} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">
                  #{tag}
                </span>
              ))}
            </span>
          )}
        </div>
      </header>

      <div
        className="prose prose-sm max-w-none [&_.expressive-code]:my-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />

    </div>
  );
}
