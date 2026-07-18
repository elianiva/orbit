import { Context, Data, Effect, Layer } from "effect";

import { env } from "~/server/env";

const MODEL = "@cf/baai/bge-m3";

export interface EmbeddingServiceShape {
  readonly embed: (text: string) => Effect.Effect<number[], EmbeddingError>;
  readonly embedBatch: (texts: string[]) => Effect.Effect<number[][], EmbeddingError>;
}

export class EmbeddingService extends Context.Service<EmbeddingService, EmbeddingServiceShape>()(
  "orbit/EmbeddingService",
) {}

export const EmbeddingServiceLive: Layer.Layer<EmbeddingService> = Layer.succeed(
  EmbeddingService,
  EmbeddingService.of({
    embed: (text) =>
      Effect.tryPromise({
        try: async () => {
          const result = (await env.AI.run(MODEL, { text })) as {
            shape: number[];
            data: number[];
          };
          return result.data;
        },
        catch: (cause) => new EmbeddingError({ cause, text }),
      }),

    embedBatch: (texts) =>
      Effect.tryPromise({
        try: async () => {
          const result = (await env.AI.run(MODEL, { text: texts })) as {
            shape: number[];
            data: number[][];
          };
          return result.data;
        },
        catch: (cause) => new EmbeddingError({ cause, text: texts.join("\n") }),
      }),
  }),
);

export class EmbeddingError extends Data.TaggedError("EmbeddingError")<{
  readonly cause: unknown;
  readonly text: string;
}> {}
