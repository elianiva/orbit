// Lazy env proxy: defers access to `cloudflare:workers` env until
// handler runtime, so TanStack Start dev server can evaluate route
// modules outside request context without crashing.
import * as cf from "cloudflare:workers";

type RuntimeEnv = typeof cf.env;

export const env = new Proxy({} as RuntimeEnv, {
  get(_, prop) {
    return cf.env[prop as keyof typeof cf.env];
  },
});
