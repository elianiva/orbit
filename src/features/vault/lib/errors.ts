import { Data } from "effect";

export class NoteValidationError extends Data.TaggedError("NoteValidationError")<{
  readonly reason: "empty" | "oversize";
}> {}

export class NoteNotFoundError extends Data.TaggedError("NoteNotFoundError")<{
  readonly path: string;
}> {}

export class NoteNotAllowedError extends Data.TaggedError("NoteNotAllowedError")<{
  readonly path: string;
  readonly reason: string;
}> {}

export class NoteDbError extends Data.TaggedError("NoteDbError")<{
  readonly cause: unknown;
}> {}
