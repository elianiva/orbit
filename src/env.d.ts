/// <reference types="@cloudflare/vitest-pool-workers/types" />
declare module "cloudflare:workers" {
  interface Env {
    ORBIT_DB: D1Database;
    ORBIT_STORAGE: R2Bucket;
    VECTORIZE_INDEX: VectorizeIndex;
    AI: Ai;
  }
  const env: Env;
  export { env };
}
