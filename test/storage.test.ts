import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";
import { R2Service, R2ServiceLive } from "~/server/storage/r2-service";

layer(R2ServiceLive)("r2 storage", (it) => {
  it.effect("put and get round-trip", () =>
    Effect.gen(function* () {
      const r2 = yield* R2Service;

      yield* r2.put("test.md", "hello world");
      const content = yield* r2.get("test.md");

      assert.strictEqual(content, "hello world");
    }),
  );

  it.effect("get returns null for nonexistent key", () =>
    Effect.gen(function* () {
      const r2 = yield* R2Service;
      const content = yield* r2.get("does-not-exist.md");

      assert.strictEqual(content, null);
    }),
  );

  it.effect("delete removes object", () =>
    Effect.gen(function* () {
      const r2 = yield* R2Service;

      yield* r2.put("to-delete.md", "delete me");
      yield* r2.delete("to-delete.md");
      const content = yield* r2.get("to-delete.md");

      assert.strictEqual(content, null);
    }),
  );

  it.effect("list returns stored objects", () =>
    Effect.gen(function* () {
      const r2 = yield* R2Service;

      yield* r2.put("list/a.md", "a");
      yield* r2.put("list/b.md", "b");
      const result = yield* r2.list("list/");

      assert.strictEqual(result.objects.length, 2);
      assert.isFalse(result.truncated);
    }),
  );

  it.effect("getContentType detects MIME types", () =>
    Effect.gen(function* () {
      const r2 = yield* R2Service;
      assert.strictEqual(r2.getContentType("photo.jpg"), "image/jpeg");
      assert.strictEqual(r2.getContentType("notes.md"), "text/markdown");
      assert.strictEqual(r2.getContentType("data.bin"), "application/octet-stream");
    }),
  );

  it.effect("put stores with inferred content type", () =>
    Effect.gen(function* () {
      const r2 = yield* R2Service;

      const info = yield* r2.put("photo.jpg", "fake-image-data");
      assert.strictEqual(info.key, "photo.jpg");
      assert.ok(info.size > 0);
    }),
  );

  it.effect("put with explicit content type overrides inference", () =>
    Effect.gen(function* () {
      const r2 = yield* R2Service;

      const info = yield* r2.put("data.bin", "binary-data", "application/octet-stream");
      assert.strictEqual(info.contentType, "application/octet-stream");
    }),
  );
});
