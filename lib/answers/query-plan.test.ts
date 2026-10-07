import { describe, expect, test } from "vitest";
import { planQueries } from "./query-plan";

describe("answer query planning", () => {
  test("sanitizes PII before producing bounded distinct queries", () => {
    const queries = planQueries({
      problem: "Outlook fails for alex@example.com on Windows",
      platform: "Windows",
      product: "Outlook",
      denyTerms: [],
    });
    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(queries.length).toBeLessThanOrEqual(4);
    expect(queries.every((query) => query.length <= 120)).toBe(true);
    expect(queries.join(" ")).not.toContain("alex@example.com");
  });

  test("preserves at most two allowed error codes after sanitization", () => {
    const queries = planQueries({
      problem:
        "Outlook error 0x80070005 AADSTS50076 code: ERR-2034 code: ERR-7788",
      platform: "Windows",
      denyTerms: [],
    });
    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(queries.join(" ")).toContain("0x80070005");
    expect(queries.join(" ")).toContain("AADSTS50076");
    expect(queries.join(" ")).not.toContain("ERR-7788");
  });

  test("does not reintroduce email or IP fragments as error codes", () => {
    const queries = planQueries({
      problem: "error AB1234@example.com code: 192.168.1.1",
      platform: null,
      denyTerms: [],
    });
    expect(queries.join(" ")).not.toContain("AB1234");
    expect(queries.join(" ")).not.toContain("192");
    expect(queries.join(" ")).not.toContain("@");
    expect(
      planQueries({
        problem: "VPN error 2001:db8::1",
        platform: null,
        denyTerms: [],
      }).join(" ")
    ).not.toContain("2001");
  });

  test("adds only permitted numeric version tokens and the fix query when needed", () => {
    const queries = planQueries({
      problem: "Printer queue stuck",
      platform: "Windows",
      product: "Contoso Print",
      version: "3.2.1 build-SECRET 4.0",
      denyTerms: [],
    });
    expect(queries.some((query) => query.includes("3.2.1"))).toBe(true);
    expect(queries.some((query) => query.includes("4.0"))).toBe(true);
    expect(queries.join(" ")).not.toContain("SECRET");
    expect(queries.length).toBeLessThanOrEqual(4);
    expect(
      planQueries({
        problem: "password secret@example.com",
        platform: null,
        denyTerms: ["password", "secret@example.com"],
      })
    ).toEqual([]);
  });
});
