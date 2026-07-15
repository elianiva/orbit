import { Effect } from "effect";
import { eq } from "drizzle-orm";

import { Database } from "~/server/db/client";
import { nodes } from "~/server/db/schema";
import { R2Service } from "~/server/storage/r2-service";

function isExpired(frontmatter: Record<string, unknown>, now: Date): boolean {
  const ttl = frontmatter.ttl;
  const createdAt = frontmatter.created_at;
  if (typeof ttl !== "number" || ttl <= 0) return false;
  if (typeof createdAt !== "string") return false;
  const expiresAt = new Date(new Date(createdAt).getTime() + ttl * 1000);
  return now > expiresAt;
}

export const deleteExpiredNotes = Effect.fn("deleteExpiredNotes")(function* () {
  const { db } = yield* Database;
  const r2 = yield* R2Service;

  const now = new Date();

  const allNotes = yield* Effect.tryPromise({
    try: () =>
      db.select({ id: nodes.id, path: nodes.path, frontmatter: nodes.frontmatter }).from(nodes),
    catch: (cause) => new Error(String(cause)),
  });

  const expiredIds: string[] = [];
  for (const row of allNotes) {
    if (isExpired(row.frontmatter as Record<string, unknown>, now)) {
      expiredIds.push(row.id);
    }
  }

  if (expiredIds.length === 0) {
    return { deleted: 0 };
  }

  for (const id of expiredIds) {
    yield* Effect.tryPromise({
      try: () => db.delete(nodes).where(eq(nodes.id, id)),
      catch: (cause) => new Error(String(cause)),
    });
    yield* r2.delete(`notes/${id}`).pipe(Effect.mapError((cause) => new Error(String(cause))));
  }

  return { deleted: expiredIds.length };
});
