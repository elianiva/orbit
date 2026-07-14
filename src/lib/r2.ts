import { Context, Effect, Layer } from "effect";

import { env } from "cloudflare:workers";

export interface R2BlobInfo {
  readonly key: string;
  readonly size: number;
  readonly etag: string;
  readonly httpEtag: string;
  readonly contentType: string;
  readonly checksums: { readonly md5: string; readonly sha1: string; readonly sha256: string };
}

export interface R2ListResult {
  readonly objects: R2BlobInfo[];
  readonly truncated: boolean;
  readonly cursor?: string;
}

export interface R2Service {
  readonly get: (key: string) => Effect.Effect<string | null, R2Error>;
  readonly getRaw: (key: string) => Effect.Effect<ReadableStream | null, R2Error>;
  readonly put: (
    key: string,
    body: ReadableStream | ArrayBuffer | string,
    contentType?: string,
  ) => Effect.Effect<R2BlobInfo, R2Error>;
  readonly delete: (key: string) => Effect.Effect<void, R2Error>;
  readonly list: (prefix: string) => Effect.Effect<R2ListResult, R2Error>;
  readonly getContentType: (key: string) => string;
}

export class R2Service extends Context.Service<
  R2Service,
  {
    readonly get: (key: string) => Effect.Effect<string | null, R2Error>;
    readonly getRaw: (key: string) => Effect.Effect<ReadableStream | null, R2Error>;
    readonly put: (
      key: string,
      body: ReadableStream | ArrayBuffer | string,
      contentType?: string,
    ) => Effect.Effect<R2BlobInfo, R2Error>;
    readonly delete: (key: string) => Effect.Effect<void, R2Error>;
    readonly list: (prefix: string) => Effect.Effect<R2ListResult, R2Error>;
    readonly getContentType: (key: string) => string;
  }
>()("orbit/R2Service") {}

const MIME_MAP: Record<string, string> = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".wasm": "application/wasm",
};

function inferContentType(key: string): string {
  const ext = key.slice(key.lastIndexOf("."));
  return MIME_MAP[ext.toLowerCase()] ?? "application/octet-stream";
}

function toBlobInfo(obj: {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  checksums: Record<string, string>;
}): R2BlobInfo {
  return {
    key: obj.key,
    size: obj.size,
    etag: obj.etag,
    httpEtag: obj.httpEtag,
    contentType: obj.httpMetadata?.contentType ?? "",
    checksums: obj.checksums as R2BlobInfo["checksums"],
  };
}

export const R2ServiceLive: Layer.Layer<R2Service> = Layer.succeed(R2Service, {
  get: (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const obj = await env.ORBIT_STORAGE.get(key);
        if (!obj) return null;
        return obj.text();
      },
      catch: (cause) => new R2Error({ cause, operation: "get", key }),
    }),

  getRaw: (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const obj = await env.ORBIT_STORAGE.get(key);
        if (!obj) return null;
        return obj.body;
      },
      catch: (cause) => new R2Error({ cause, operation: "get", key }),
    }),

  put: (key: string, body: ReadableStream | ArrayBuffer | string, contentType?: string) =>
    Effect.tryPromise({
      try: async () => {
        const result = await env.ORBIT_STORAGE.put(key, body, {
          httpMetadata: {
            contentType: contentType ?? inferContentType(key),
            cacheControl: "public, max-age=3600",
          },
        });
        return toBlobInfo(result);
      },
      catch: (cause) => new R2Error({ cause, operation: "put", key }),
    }),

  delete: (key: string) =>
    Effect.tryPromise({
      try: () => env.ORBIT_STORAGE.delete(key),
      catch: (cause) => new R2Error({ cause, operation: "delete", key }),
    }),

  list: (prefix: string) =>
    Effect.tryPromise({
      try: async () => {
        const result = await env.ORBIT_STORAGE.list({ prefix });
        return {
          objects: result.objects.map(toBlobInfo),
          truncated: result.truncated,
          cursor: result.cursor,
        };
      },
      catch: (cause) => new R2Error({ cause, operation: "list", key: prefix }),
    }),

  getContentType: (key: string) => inferContentType(key),
});

export class R2Error extends Error {
  readonly _tag = "R2Error" as const;
  constructor(args: { readonly cause: unknown; readonly operation: string; readonly key: string }) {
    super(`R2 ${args.operation} failed for "${args.key}": ${String(args.cause)}`);
  }
}
