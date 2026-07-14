import { Layer } from "effect";

import { RenderServiceLive } from "~/features/render/lib/service";

import { DatabaseLive } from "./db/client";
import { SearchServiceLive } from "./db/search";
import { LoggerLive } from "./logger";
import { R2ServiceLive } from "./storage/r2-service";

export const AppLayer = Layer.mergeAll(
  DatabaseLive,
  SearchServiceLive.pipe(Layer.provide(DatabaseLive)),
  R2ServiceLive,
  RenderServiceLive,
  LoggerLive,
);
