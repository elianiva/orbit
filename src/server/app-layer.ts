import { Layer } from "effect";

import { NoteServiceLive } from "~/features/vault/lib/service";
import { RenderServiceLive } from "~/features/render/lib/service";

import { DatabaseLive } from "./db/client";
import { SearchServiceLive } from "./db/search";
import { EmbeddingServiceLive } from "./embedding";
import { LoggerLive } from "./logger";
import { R2ServiceLive } from "./storage/r2-service";
import { VectorizeServiceLive } from "./vectorize";

export const AppLayer = Layer.mergeAll(
  DatabaseLive,
  VectorizeServiceLive,
  EmbeddingServiceLive,
  SearchServiceLive.pipe(
    Layer.provide(DatabaseLive),
    Layer.provide(VectorizeServiceLive),
    Layer.provide(EmbeddingServiceLive),
  ),
  R2ServiceLive,
  RenderServiceLive,
  NoteServiceLive.pipe(
    Layer.provide(DatabaseLive),
    Layer.provide(R2ServiceLive),
    Layer.provide(EmbeddingServiceLive),
    Layer.provide(VectorizeServiceLive),
  ),
  LoggerLive,
);
