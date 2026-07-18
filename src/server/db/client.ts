import { Context, Layer } from "effect";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import { env } from "~/server/env";
import * as schema from "./schema";

export interface DatabaseShape {
  readonly db: DrizzleD1Database<typeof schema>;
}

export class Database extends Context.Service<Database, DatabaseShape>()("orbit/Database") {}

export const DatabaseLive: Layer.Layer<Database> = Layer.succeed(Database, {
  db: drizzle(env.ORBIT_DB, { schema }),
});
