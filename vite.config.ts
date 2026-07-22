import { defineConfig, lazyPlugins } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import rsc from "@vitejs/plugin-rsc";
import type { Plugin } from "vite";

const config = defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => [
    devtools(),
    tailwindcss(),
    tanstackStart({ rsc: { enabled: true } }),
    rsc(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
    // Bundle packages that don't have react as a peer dependency
    // into the rsc environment so they resolve at runtime in Workers.
    {
      name: "orbit:rsc-noexternal",
      configEnvironment(name, options) {
        if (name !== "rsc") return;
        const pkgs = [
          "effect",
          "drizzle-orm",
          "nanoid",
          "zod",
          "@mdx-js/mdx",
          "gray-matter",
          "unified",
          "remark-parse",
          "remark-gfm",
          "remark-math",
          "remark-wiki-link",
          "remark-rehype",
          "rehype-expressive-code",
          "rehype-stringify",
        ];
        if (options.resolve?.noExternal === true) return;
        if (Array.isArray(options.resolve?.noExternal)) {
          for (const pkg of pkgs) {
            if (!options.resolve.noExternal.includes(pkg)) {
              (options.resolve.noExternal as (string | RegExp)[]).push(pkg);
            }
          }
        } else if (options.resolve?.noExternal == null) {
          options.resolve = { ...options.resolve, noExternal: pkgs };
        }
      },
    } satisfies Plugin,
  ]),
});

export default config;
