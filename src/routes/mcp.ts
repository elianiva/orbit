import { Effect } from "effect";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";

import { NoteService } from "~/features/vault/lib/service";
import { SearchService } from "~/server/db/search";
import { R2Service } from "~/server/storage/r2-service";
import { getRuntime } from "~/server/app-runtime";
import { handleMcpRequest } from "~/utils/mcp-handler";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const runtime = getRuntime();

const server = new McpServer({
  name: "orbit",
  version: "1.0.0",
});

function run<A>(effect: Effect.Effect<A, any, any>): Promise<A> {
  return runtime.runPromise(effect);
}

function errResult(msg: string): CallToolResult {
  return { isError: true, content: [{ type: "text" as const, text: msg }] };
}

server.registerTool(
  "vault.search",
  {
    title: "Search vault notes",
    description: "Search notes in the vault by query string. Returns ranked results with snippets.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 20)"),
    }),
  },
  async ({ query, limit }) => {
    try {
      const results = await run(
        Effect.gen(function* () {
          const search = yield* SearchService;
          return yield* search.search(query, limit);
        }),
      );
      return {
        content: [
          {
            type: "text" as const,
            text:
              results.length === 0
                ? "No results found."
                : results
                    .map(
                      (r) =>
                        `[${r.path}] ${r.title}\n  ${r.snippet}\n  (score: ${r.rank.toFixed(3)})`,
                    )
                    .join("\n\n"),
          },
        ],
      };
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
);

server.registerTool(
  "vault.read",
  {
    title: "Read a vault note",
    description: "Read the full content of a note by its path.",
    inputSchema: z.object({
      path: z.string().describe("Path of the note to read"),
    }),
  },
  async ({ path }) => {
    try {
      const { node, content } = await run(
        Effect.gen(function* () {
          const note = yield* NoteService;
          return yield* note.read(path);
        }),
      );
      const meta = [
        `Path: ${node.path}`,
        `Created: ${node.createdAt.toISOString()}`,
        `Size: ${node.size} bytes`,
        `Preview: ${node.contentPreview.slice(0, 100)}`,
      ].join("\n");

      return { content: [{ type: "text" as const, text: `---\n${meta}\n---\n\n${content}` }] };
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
);

server.registerTool(
  "vault.tree",
  {
    title: "List vault tree",
    description: "List notes in the vault, optionally filtered under a path prefix.",
    inputSchema: z.object({
      parent: z.string().optional().describe("Optional path prefix to filter children under"),
    }),
  },
  async ({ parent }) => {
    try {
      const results = await run(
        Effect.gen(function* () {
          const note = yield* NoteService;
          return yield* note.tree(parent);
        }),
      );
      return {
        content: [
          {
            type: "text" as const,
            text:
              results.length === 0
                ? "No notes found."
                : results.map((r) => `  ${r.path}`).join("\n"),
          },
        ],
      };
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
);

server.registerTool(
  "vault.write",
  {
    title: "Write a vault note",
    description:
      "Create or update a note under the agent/ namespace. Path must start with 'agent/'. Content can include YAML frontmatter (--- delimited).",
    inputSchema: z.object({
      path: z.string().describe("Path for the note (must start with 'agent/')"),
      content: z.string().describe("Content of the note, may include YAML frontmatter"),
      title: z.string().optional().describe("Optional title (overrides frontmatter title)"),
    }),
  },
  async ({ path, content, title }) => {
    try {
      const result = await run(
        Effect.gen(function* () {
          const note = yield* NoteService;
          return yield* note.write({ path, content, title });
        }),
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Created/updated note at ${result.path}\n  Size: ${result.size} bytes\n  Created: ${result.createdAt.toISOString()}`,
          },
        ],
      };
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
);

server.registerTool(
  "vault.attachment",
  {
    title: "Get a vault attachment",
    description:
      "Read a binary attachment (image, PDF, etc.) from the vault by key. Returns base64-encoded content with MIME type.",
    inputSchema: z.object({
      key: z.string().describe("Storage key of the attachment"),
    }),
  },
  async ({ key }) => {
    try {
      const blob = await run(
        Effect.gen(function* () {
          const r2 = yield* R2Service;
          return yield* r2.getRaw(key);
        }),
      );

      if (!blob) {
        return errResult(`Attachment not found: ${key}`);
      }

      const arrayBuffer = await run(Effect.promise(() => new Response(blob as any).arrayBuffer()));
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const contentType = await run(
        Effect.gen(function* () {
          const r2 = yield* R2Service;
          return r2.getContentType(key);
        }),
      );

      return {
        content: [
          {
            type: "resource" as const,
            resource: {
              text: base64,
              uri: `data:${contentType};base64,${base64}`,
              mimeType: contentType,
            },
          },
        ],
      };
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err));
    }
  },
);

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMcpRequest(request, server),
    },
  },
});
