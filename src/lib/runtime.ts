import { env } from "cloudflare:workers";
import { Context, Layer, ManagedRuntime } from "effect";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import { SearchServiceLive } from "./db/search";
import * as schema from "./db/schema";

export interface Database {
  readonly db: DrizzleD1Database<typeof schema>;
}

export class Database extends Context.Service<Database, {
  readonly db: DrizzleD1Database<typeof schema>;
}>()("orbit/Database") {}

export const DatabaseLive: Layer.Layer<Database> = Layer.succeed(Database, {
  db: drizzle(env.ORBIT_DB, { schema }),
});

const AppLayer = Layer.mergeAll(
  DatabaseLive,
  SearchServiceLive.pipe(Layer.provide(DatabaseLive)),
);

let _runtime: ManagedRuntime.ManagedRuntime<never, never> | null = null;

export function getRuntime(): ManagedRuntime.ManagedRuntime<never, never> {
  if (!_runtime) {
    _runtime = ManagedRuntime.make(AppLayer);
  }
  return _runtime;
}
