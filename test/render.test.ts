import { assert, describe, it, layer } from "@effect/vitest";
import { Effect } from "effect";
import { RenderService, RenderServiceLive } from "~/features/render/lib/service";

layer(RenderServiceLive)("render", (it) => {
  it.effect("markdown to html with GFM features", () =>
    Effect.gen(function*() {
      const render = yield* RenderService;
      const result = yield* render.toHtml(
        "# Hello\n\n**bold** and `code`",
      );

      assert.include(result.html, "<h1>");
      assert.include(result.html, "<strong>bold</strong>");
      assert.include(result.html, "<code>code</code>");
    }));

  it.effect("markdown with YAML frontmatter extracts metadata", () =>
    Effect.gen(function*() {
      const render = yield* RenderService;
      const result = yield* render.toHtml(
        "---\ntitle: My Note\ntags: [foo, bar]\n---\n\n# Content",
      );

      assert.isOk(result.frontmatter);
      assert.strictEqual((result.frontmatter as any).title, "My Note");
      assert.include(result.html, "<h1>Content</h1>");
    }));

  it.effect("markdown with wikilinks", () =>
    Effect.gen(function*() {
      const render = yield* RenderService;
      const result = yield* render.toHtml("See [[Other Note]] for details.");

      assert.include(result.html, "Other Note");
    }));

  it.effect("markdown with code block gets expressive code treatment", () =>
    Effect.gen(function*() {
      const render = yield* RenderService;
      const result = yield* render.toHtml(
        '```ts\nconst x = 1;\n```',
      );

      assert.include(result.html, "const x = 1");
    }));

  it.effect("mdx with Callout component", () =>
    Effect.gen(function*() {
      const render = yield* RenderService;
      const result = yield* render.toMdx(
        '<Callout variant="warning" title="Heads up">Be careful</Callout>',
      );

      assert.include(result.html, "Heads up");
      assert.include(result.html, "Be careful");
    }));

  it.effect("mdx with EmbeddedHtml component", () =>
    Effect.gen(function*() {
      const render = yield* RenderService;
      const result = yield* render.toMdx(
        '<EmbeddedHtml html="<span>raw</span>" />',
      );

      assert.include(result.html, "<span>raw</span>");
    }));

  it.effect("malformed mdx returns RenderError", () =>
    Effect.gen(function*() {
      const render = yield* RenderService;
      const result = yield* Effect.exit(
        render.toMdx("{invalid mdx syntax <<<"),
      );

      assert.strictEqual(result._tag, "Failure");
    }));
});
