import { Context, Effect, Layer, Schema } from "effect";
import { evaluate } from "@mdx-js/mdx";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

import { Callout, CodeBlock } from "../components";
import { EmbeddedHtml } from "../embedded-html";

import { RenderError } from "./errors";

export const RenderResult = Schema.Struct({
  html: Schema.String,
  frontmatter: Schema.optional(Schema.Any),
});
export type RenderResult = typeof RenderResult.Type;

export interface RenderServiceShape {
  readonly toHtml: (source: string) => Effect.Effect<RenderResult, RenderError>;
  readonly toMdx: (source: string) => Effect.Effect<RenderResult, RenderError>;
  readonly toMdxComponent: (
    source: string,
  ) => Effect.Effect<
    { Component: React.ComponentType; frontmatter: Record<string, unknown> | null },
    RenderError
  >;
}

export class RenderService extends Context.Service<RenderService, RenderServiceShape>()(
  "orbit/RenderService",
) {}

const MDX_COMPONENTS = {
  Callout,
  EmbeddedHtml,
  CodeBlock,
};

async function createMarkdownProcessor() {
  const { unified } = await import("unified");
  const remarkParse = (await import("remark-parse")).default;
  const remarkGfm = (await import("remark-gfm")).default;
  const remarkMath = (await import("remark-math")).default;
  const remarkWikiLink = (await import("remark-wiki-link")).default;
  const remarkRehype = (await import("remark-rehype")).default;
  const rehypeExpressiveCode = (await import("rehype-expressive-code")).default;
  const rehypeStringify = (await import("rehype-stringify")).default;

  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkWikiLink)
    .use(remarkRehype)
    .use(rehypeExpressiveCode)
    .use(rehypeStringify);
}

export const RenderServiceLive = Layer.succeed(
  RenderService,
  RenderService.of({
    toHtml: (source: string) =>
      Effect.tryPromise({
        try: async () => {
          const matter = await import("gray-matter");
          const markdownProcessor = await createMarkdownProcessor();

          const { content, data } = matter.default(source);
          const file = await markdownProcessor.process(content);
          return RenderResult.make({
            html: String(file),
            frontmatter: Object.keys(data).length > 0 ? data : null,
          });
        },
        catch: (cause) => new RenderError({ cause, phase: "toHtml" }),
      }),
    toMdx: (source: string) =>
      Effect.tryPromise({
        try: async () => {
          const { renderToString } = await import("react-dom/server");

          const { default: MDXContent } = (await evaluate(source, {
            Fragment,
            jsx,
            jsxs,
            useMDXComponents: () => MDX_COMPONENTS,
          })) as { default: React.ComponentType };

          const html = renderToString(jsx(MDXContent, { components: MDX_COMPONENTS }));
          return RenderResult.make({
            html,
            frontmatter: null,
          });
        },
        catch: (cause) => new RenderError({ cause, phase: "toMdx" }),
      }),
    toMdxComponent: (source: string) =>
      Effect.tryPromise({
        try: async () => {
          const { default: Component, frontmatter: fm } = (await evaluate(source, {
            Fragment,
            jsx,
            jsxs,
            useMDXComponents: () => MDX_COMPONENTS,
          })) as {
            default: React.ComponentType;
            frontmatter?: Record<string, unknown>;
          };

          return { Component, frontmatter: fm ?? null };
        },
        catch: (cause) => new RenderError({ cause, phase: "toMdx" }),
      }),
  }),
);
