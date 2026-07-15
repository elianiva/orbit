import { Data } from "effect";

export class RenderError extends Data.TaggedError("RenderError")<{
  readonly cause: unknown;
  readonly phase: "toHtml" | "toMdx";
}> {}
