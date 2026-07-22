import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { adopt } from "alchemy/AdoptPolicy";

const Zone = Cloudflare.Zone.Zone("Zone", {
  name: "elianiva.com",
}).pipe(adopt(true));

const DB = Cloudflare.D1.Database("DB", {
  migrationsDir: "./drizzle",
});

const Bucket = Cloudflare.R2.Bucket("Bucket");

const VectorizeIndex = Cloudflare.Vectorize.Index("VectorizeIndex", {
  // dimensions must match @cf/baai/bge-m3 (1024-d cosine).
  dimensions: 1024,
  metric: "cosine",
  description: "Semantic search index for orbit vault",
});

const Gate = Cloudflare.AI.Gateway("Gate", {
  collectLogs: true,
  cacheTtl: 60,
});

const AllowAuth = Cloudflare.Access.Policy("AllowAuth", {
  decision: "allow",
  include: [{ emailDomain: { domain: "elianiva.com" } }],
});

const BypassShare = Cloudflare.Access.Policy("BypassShare", {
  decision: "bypass",
  include: [{ everyone: {} }],
});

const WebsiteProps = Effect.gen(function* () {
  const stage = yield* Alchemy.Stage;
  return {
    compatibility: {
      flags: ["nodejs_compat"],
    },
    ...(stage === "production" ? { domain: "orbit.elianiva.com" } : {}),
    assets: {
      runWorkerFirst: false,
    },
    env: {
      ORBIT_DB: DB,
      ORBIT_STORAGE: Bucket,
      VECTORIZE_INDEX: VectorizeIndex,
      AI: Gate,
    },
  };
});

export class Website extends Cloudflare.Website.Vite<Website>()("Website", WebsiteProps) {}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "Orbit",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const zone = yield* Zone;
    const db = yield* DB;
    const bucket = yield* Bucket;
    const index = yield* VectorizeIndex;
    const website = yield* Website;

    // Access policies
    const allowAuth = yield* AllowAuth;
    const bypassShare = yield* BypassShare;

    // Service token for MCP client auth
    const mcpToken = yield* Cloudflare.Access.ServiceToken("McpToken");

    const allowMcpToken = yield* Cloudflare.Access.Policy("AllowMcpToken", {
      decision: "non_identity",
      include: [{ serviceToken: { tokenId: mcpToken.serviceTokenId } }],
    });

    // Web app gated by email domain
    yield* Cloudflare.Access.Application("OrbitAccess", {
      type: "self_hosted",
      domain: "orbit.elianiva.com",
      policies: [allowAuth.policyId],
    });

    // Public share routes (bypass Access)
    yield* Cloudflare.Access.Application("ShareAccess", {
      type: "self_hosted",
      domain: "orbit.elianiva.com/share/*",
      policies: [bypassShare.policyId],
    });

    // MCP endpoint gated by service token
    yield* Cloudflare.Access.Application("McpAccess", {
      type: "self_hosted",
      destinations: [
        { type: "public", uri: "https://orbit.elianiva.com/mcp" },
        { type: "public", uri: "https://orbit.elianiva.com/mcp/*" },
      ],
      policies: [allowMcpToken.policyId],
    });

    return {
      url: website.url.as<string>(),
      databaseName: db.databaseName,
      bucketName: bucket.bucketName,
      indexName: index.indexName,
      zoneId: zone.zoneId,
      mcpClientId: mcpToken.clientId,
    };
  }),
);
