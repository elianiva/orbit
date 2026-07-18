import { ManagedRuntime } from "effect";

import { AppLayer } from "./app-layer";

// Lazy init — ManagedRuntime.make(env layer) isn't safe at module eval time.
let _runtime: ManagedRuntime.ManagedRuntime<any, any> | null = null;

export function getRuntime() {
  if (!_runtime) {
    _runtime = ManagedRuntime.make(AppLayer);
  }
  return _runtime;
}
