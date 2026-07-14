import { Context, Effect, Layer } from "effect";
import { markdownToHtml, evaluate } from "satteri";
import expressiveCode from "satteri-expressive-code";
import yaml from "js-yaml";
import { renderToString } from "react-dom/server";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";

import { RenderError } from "./errors";
import { Callout, EmbeddedHtml, CodeBlock } from "./components";

export interface RenderResult {
  readonly html: string;
  readonly frontmatter: Record<string, unknown> | null;
}

export interface RenderService {
  readonly toHtml: (source: string) => Effect.Effect<RenderResult, RenderError>;
  readonly toMdx: (source: string) => Effect.Effect<RenderResult, RenderError>;
}

export class RenderService extends Context.Service<
  RenderService,
  {
    readonly toHtml: (source: string) => Effect.Effect<RenderResult, RenderError>;
    readonly toMdx: (source: string) => Effect.Effect<RenderResult, RenderError>;
  }
>()("orbit/RenderService") {}

const MDX_COMPONENTS = {
  Callout,
  EmbeddedHtml,
  CodeBlock,
};

function parseFrontmatter(
  raw: { kind: string; value: string } | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  if (raw.kind === "yaml") {
    return yaml.load(raw.value) as Record<string, unknown>;
  }
  return null;
}

export const RenderServiceLive: Layer.Layer<RenderService> = Layer.succeed(RenderService, {
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
        return {
          html: result.html,
          frontmatter: parseFrontmatter(result.frontmatter),
        };
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

        const html = renderToString(jsx(Component, {}));
        return {
          html,
          frontmatter: null,
        };
      },
      catch: (cause) => new RenderError({ cause, phase: "toMdx" }),
    }),
});
