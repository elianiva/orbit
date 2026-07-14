export class RenderError extends Error {
  readonly _tag = "RenderError" as const;
  constructor(args: { readonly cause: unknown; readonly phase: string }) {
    super(`Render ${args.phase} failed: ${String(args.cause)}`);
  }
}
