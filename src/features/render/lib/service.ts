import { Context, Effect, Layer, Match, Schema } from "effect";
import { markdownToHtml, evaluate } from "satteri";
import expressiveCode from "satteri-expressive-code";
import * as yaml from "js-yaml";
import { renderToString } from "react-dom/server";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";

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

function parseFrontmatter(raw?: { kind: string; value: string } | null) {
  return Match.value(raw).pipe(
    Match.when({ kind: "yaml" }, (r) => yaml.load(r.value) as Record<string, unknown>),
    Match.orElse(() => null),
  );
}

export const RenderServiceLive = Layer.succeed(
  RenderService,
  RenderService.of({
    toHtml: (source: string) =>
      Effect.tryPromise({
        try: async () => {
          const result = await markdownToHtml(source, {
            features: {
              gfm: true,
              frontmatter: true,
              math: true,
              wikilinks: true,
            },
            hastPlugins: [expressiveCode({ themes: ["one-light"], useDarkModeMediaQuery: false })],
          });
          return RenderResult.make({
            html: result.html,
            frontmatter: parseFrontmatter(result.frontmatter),
          });
        },
        catch: (cause) => new RenderError({ cause, phase: "toHtml" }),
      }),
    toMdx: (source: string) =>
      Effect.tryPromise({
        try: async () => {
          // evaluate expects looser JSX runtime types than React provides
          const jsxRuntime = { Fragment, jsx, jsxs } as Parameters<typeof evaluate>[1];
          const { default: Component } = (await evaluate(source, {
            ...jsxRuntime,
            useMDXComponents: () => MDX_COMPONENTS,
          })) as { default: React.ComponentType };

          const html = renderToString(jsx(Component, { components: MDX_COMPONENTS }));
          return RenderResult.make({
            html,
            frontmatter: null,
          });
        },
        catch: (cause) => new RenderError({ cause, phase: "toMdx" }),
      }),
  }),
);
