import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { z } from "zod";

import { NoteService } from "~/features/vault/lib/service";
import { RenderService } from "~/features/render/lib/service";
import { getRuntime } from "~/server/app-runtime";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const getNoteHtml = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const runtime = getRuntime();
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const ns = yield* NoteService;
        const rs = yield* RenderService;
        const { node, content } = yield* ns.read(data.id);
        const rendered = yield* rs.toHtml(content);
        return { node, ...rendered };
      }).pipe(
        Effect.catchTag("NoteNotFoundError", () => Effect.succeed(null)),
        Effect.catchTag("NoteDbError", () => Effect.succeed(null)),
        Effect.catch((err) => {
          console.error("[getNoteHtml] unexpected error:", err);
          return Effect.succeed(null);
        }),
      ),
    );

    if (!result) return null;

    const { node, html, frontmatter: fm } = result;
    const fmObj = fm as Record<string, unknown> | null;
    const title = (fmObj?.title as string | undefined) || node.path.slice(0, 40);
    const tags = fmObj?.tags as string[] | undefined;
    const date =
      node.createdAt instanceof Date
        ? node.createdAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : node.createdAt;

    return { title, html, tags: tags ?? null, date, size: node.size };
  });

export const Route = createFileRoute("/_vault/$")({
  loader: async ({ params }) => getNoteHtml({ data: { id: params._splat ?? "" } }),
  component: NoteViewPage,
});

function NoteViewPage() {
  const data = Route.useLoaderData();

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h1 className="text-6xl font-bold tracking-tight text-muted-foreground">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">note not found</p>
        <Link
          to="/"
          className="mt-8 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          back to vault
        </Link>
      </div>
    );
  }

  const { title, html, tags, date, size } = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {date && <time dateTime={date}>{date}</time>}
          <span>{formatSize(size)}</span>
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
