import { describe, expect, test } from "vitest";
import { redactAuditDetail } from "../audit/redact";
import { guardModelInput } from "./input";

const seededSecrets = [
  "my password is Hunter2!",
  "sk-live-1234567890abcdef",
  "MFA code: 123456",
  "AKIA1234567890ABCDEF",
  "4532015112830366",
  "recovery key: alpha-bravo-charlie",
];

describe("autonomy secret hygiene", () => {
  test("redacts captured database, console, and Sentry data", () => {
    const databasePayloads: unknown[] = [];
    const consoleOutput: unknown[] = [];
    const sentryMessages: unknown[] = [];
    const sentryBreadcrumbs: unknown[] = [];
    const raw = seededSecrets.join(" | ");
    const safe = guardModelInput([{ source: "ticket.description", text: raw }])
      .fields[0]?.text;
    const detail = redactAuditDetail({ raw });
    databasePayloads.push({ detail, upsert: detail });
    consoleOutput.push(detail);
    sentryMessages.push(detail);
    sentryBreadcrumbs.push({ data: detail });
    const captured = JSON.stringify({
      databasePayloads,
      consoleOutput,
      sentryMessages,
      sentryBreadcrumbs,
      safe,
    });
    for (const secret of seededSecrets) expect(captured).not.toContain(secret);
  });
});
