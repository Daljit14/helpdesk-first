import { describe, expect, test } from "vitest";
import { redactAuditDetail } from "./redact";

describe("audit redaction", () => {
  test("redacts email and token values", () => {
    const result = redactAuditDetail({
      message: "email alice@example.com token sk_test_123456789",
    });
    expect(result.message).not.toContain("alice@example.com");
    expect(result.message).not.toContain("sk_test_123456789");
  });

  test("caps recursive depth and object keys", () => {
    let value: Record<string, unknown> = { leaf: "value" };
    for (let index = 0; index < 8; index += 1) value = { next: value };
    const result = redactAuditDetail({
      nested: value,
      ...Object.fromEntries(
        Array.from({ length: 120 }, (_, index) => [`key${index}`, index])
      ),
    });
    expect(JSON.stringify(result)).toContain("[truncated]");
    expect(Object.keys(result)).toHaveLength(100);
  });

  test("never throws on hostile payloads", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => redactAuditDetail(cyclic)).not.toThrow();
  });

  test("redacts spaced and compact payment cards", () => {
    const result = redactAuditDetail({
      spaced: "4111 1111 1111 1111",
      compact: "4111111111111111",
    });
    expect(result).toEqual({
      spaced: "[card removed]",
      compact: "[card removed]",
    });
  });

  test("preserves long decimal values and scientific notation", () => {
    const result = redactAuditDetail({
      freePercent: "freePercent=72.53241234567891",
      exponent: "1.2345678901234567e-5",
    });
    expect(result).toEqual({
      freePercent: "freePercent=72.53241234567891",
      exponent: "1.2345678901234567e-5",
    });
  });
});
