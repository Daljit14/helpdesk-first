import { describe, expect, test } from "vitest";
import {
  isAllowedIncidentUrl,
  sanitizeServiceText,
  validateStatusBaseUrl,
} from "./url";

describe("service-health URL validation", () => {
  test.each([
    [
      "https://status.example.com/path?x=1#fragment",
      "https://status.example.com",
    ],
    ["https://status.example.com:443/path", "https://status.example.com"],
  ])("normalizes a permitted base URL %s", (raw, expected) => {
    expect(validateStatusBaseUrl(raw)).toBe(expected);
  });

  test.each([
    "http://status.example.com",
    "https://status.example.com:8443",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
    "https://foo.local",
    "https://foo.internal",
    "https://user:pass@status.example.com",
    "https://singlelabel",
  ])("rejects unsafe or invalid base URL %s", (raw) => {
    expect(validateStatusBaseUrl(raw)).toBeNull();
  });

  test("accepts only approved incident URL hosts and HTTPS", () => {
    expect(
      isAllowedIncidentUrl("https://status.example.com/incident/1", [
        "status.example.com",
      ])
    ).toBe(true);
    expect(isAllowedIncidentUrl("https://example.com/incident/1")).toBe(false);
    expect(isAllowedIncidentUrl("http://stspg.io/abc")).toBe(false);
  });

  test("sanitizes vendor strings to bounded plain text", () => {
    expect(
      sanitizeServiceText(
        "**Major** <b>Exchange</b> https://secret.example/x\u0000",
        80
      )
    ).toBe("Major Exchange");
  });
});
