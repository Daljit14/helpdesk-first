import { describe, expect, test } from "vitest";
import { luhnValid, SECRET_PATTERNS } from "./secret-patterns";

describe("shared secret patterns", () => {
  test.each([
    ["sk_live_abcdef123456", "api_key"],
    ["AKIA1234567890ABCDEF", "aws_key"],
    ["4111 1111 1111 1111", "card"],
    ["4111111111111111", "card"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlLXZhbHVl", "jwt"],
    ["password: Hunter2!", "password"],
    ["MFA code: 482913", "mfa_code"],
    [
      "-----BEGIN RSA PRIVATE KEY-----key material-----END RSA PRIVATE KEY-----",
      "private_key",
    ],
    ["Bearer abc.def/ghi==", "token"],
    ["ghp_abcdefghijklmnopqrstuvwxyz123456", "api_key"],
    ["xoxb-1234567890-abcdefghij", "api_key"],
    [`AIza${"A".repeat(35)}`, "api_key"],
  ] as const)("classifies %s as %s", (value, kind) => {
    expect(
      SECRET_PATTERNS.some(
        (secret) =>
          secret.kind === kind &&
          new RegExp(secret.pattern.source, secret.pattern.flags).test(value)
      )
    ).toBe(true);
  });

  test("validates Luhn card digits", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(luhnValid("1234")).toBe(false);
  });
});
