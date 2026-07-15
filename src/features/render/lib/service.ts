import { Context, Effect, Layer, Schema } from "effect";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkWikiLink from "remark-wiki-link";
import remarkRehype from "remark-rehype";
import rehypeExpressiveCode from "rehype-expressive-code";
import rehypeStringify from "rehype-stringify";
import * as matter from "gray-matter";
import { evaluate } from "@mdx-js/mdx";
import { renderToString } from "react-dom/server";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

import { Callout, EmbeddedHtml, CodeBlock } from "../components";

import { RenderError } from "./errors";

export const RenderResult = Schema.Struct({
  html: Schema.String,
  frontmatter: Schema.optional(Schema.Any),
});
export type RenderResult = typeof RenderResult.Type;

export interface RenderServiceShape {
  readonly toHtml: (source: string) => Effect.Effect<RenderResult, RenderError>;
  readonly toMdx: (source: string) => Effect.Effect<RenderResult, RenderError>;
}

export class RenderService extends Context.Service<RenderService, RenderServiceShape>()(
  "orbit/RenderService",
) {}

const MDX_COMPONENTS = {
  Callout,
  EmbeddedHtml,
  CodeBlock,
};

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkWikiLink)
  .use(remarkRehype)
  .use(rehypeExpressiveCode)
  .use(rehypeStringify);

export const RenderServiceLive = Layer.succeed(
  RenderService,
  RenderService.of({
    toHtml: (source: string) =>
      Effect.tryPromise({
        try: async () => {
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
  }),
);
