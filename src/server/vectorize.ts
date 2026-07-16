import { env } from "cloudflare:workers";
import { Context, Data, Effect, Layer } from "effect";

export interface VectorMetadata {
  readonly path: string;
  readonly title: string;
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly preview: string;
}

export interface UpsertVector {
  readonly id: string;
  readonly values: number[];
  readonly namespace?: string;
  readonly metadata: VectorMetadata;
}

export interface VectorizeQueryResult {
  readonly id: string;
  readonly score: number;
  readonly metadata: VectorMetadata;
}

export interface VectorizeServiceShape {
  readonly upsert: (vectors: UpsertVector[]) => Effect.Effect<void, VectorizeError>;
  readonly query: (
    vector: number[],
    options?: { topK?: number; namespace?: string },
  ) => Effect.Effect<VectorizeQueryResult[], VectorizeError>;
  readonly deleteByIds: (ids: string[]) => Effect.Effect<void, VectorizeError>;
}

export class VectorizeService extends Context.Service<VectorizeService, VectorizeServiceShape>()(
  "orbit/VectorizeService",
) {}

const UPSERT_BATCH_SIZE = 1000;

export const VectorizeServiceLive: Layer.Layer<VectorizeService> = Layer.succeed(
  VectorizeService,
  VectorizeService.of({
    upsert: (vectors) =>
      Effect.tryPromise({
        try: async () => {
          for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
            const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
            await env.VECTORIZE_INDEX.upsert(batch);
          }
        },
        catch: (cause) => new VectorizeError({ cause, operation: "upsert" }),
      }),

    query: (vector, options) =>
      Effect.tryPromise({
        try: async () => {
          const result = await env.VECTORIZE_INDEX.query(vector, {
            topK: options?.topK ?? 20,
            namespace: options?.namespace,
            returnMetadata: true,
          });
          return result.matches.map((m: { id: string; score: number; metadata: unknown }) => ({
            id: m.id,
            score: m.score,
            metadata: m.metadata as VectorMetadata,
          }));
        },
        catch: (cause) => new VectorizeError({ cause, operation: "query" }),
      }),

    deleteByIds: (ids) =>
      Effect.tryPromise({
        try: () => env.VECTORIZE_INDEX.deleteByIds(ids),
        catch: (cause) => new VectorizeError({ cause, operation: "deleteByIds" }),
      }),
  }),
);

export class VectorizeError extends Data.TaggedError("VectorizeError")<{
  readonly cause: unknown;
  readonly operation: string;
}> {}
