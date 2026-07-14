import { Logger } from "effect";

// Structured JSON logger for wrangler tail output.
// Logger.formatJson outputs: {"level":"INFO","timestamp":"...","message":"...","annotations":{...},"spans":{...},"fiberId":"#1"}
export const LoggerLive = Logger.layer([Logger.formatJson]);
