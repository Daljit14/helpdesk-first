import * as Sentry from "@sentry/nextjs";
import { assertGuardrailsEnforced } from "./lib/autonomy/guardrails/enforce";

export async function register() {
  assertGuardrailsEnforced();
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
