import { ManagedRuntime } from "effect";

import { AppLayer } from "./app-layer";

// Lazy because cloudflare:workers is not immediately available until the first request.
let _runtime: ManagedRuntime.ManagedRuntime<any, any> | null = null;

export function getRuntime() {
  if (!_runtime) {
    _runtime = ManagedRuntime.make(AppLayer);
  }
  return _runtime;
}
