import { describe, expect, test } from "vitest";
import { extractTerms, matchGuides } from "./guide-match";

describe("matchGuides", () => {
  test.each([
    ["my wifi keeps dropping", "wifi-disconnecting"],
    ["wifii keeps droping", "wifi-disconnecting"],
    ["wireless keeps disconnecting", "wifi-disconnecting"],
    ["printer offline", "printer-offline"],
    ["prnter offline", "printer-offline"],
    ["outlook won't open", "app-wont-open"],
    ["vpn", "vpn-problem"],
    ["my laptop is really slow", "slow-computer"],
    ["teams keeps crashing", "meeting-app-crashing"],
    ["excel is frozen and not responding", "app-frozen"],
    ["my password is expired", "password-expired"],
    ["pw reset", "cannot-reset-password"],
  ])("confidently matches %j", (text, slug) => {
    const result = matchGuides(text);
    expect(result.status).toBe("confident");
    expect(result.best?.issue.id).toBe(slug);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  test("corrects typos against guide vocabulary", () => {
    expect(extractTerms("prnter offline").corrections).toEqual({
      prnter: "printer",
    });
    expect(extractTerms("outlok").corrections).toEqual({ outlok: "outlook" });
    expect(extractTerms("wifii").terms).toEqual(["wifi"]);
  });

  test("maps IT synonyms to the same term", () => {
    for (const word of ["wifi", "wi-fi", "wireless"])
      expect(extractTerms(word).terms).toEqual(["wifi"]);
    for (const word of ["pc", "computer", "laptop"])
      expect(extractTerms(word).terms).toEqual(["computer"]);
    for (const word of ["mail", "email", "outlook"])
      expect(extractTerms(word).terms).toEqual(["email"]);
    for (const word of ["pw", "password", "passcode"])
      expect(extractTerms(word).terms).toEqual(["password"]);
    for (const word of ["cam", "webcam", "camera"])
      expect(extractTerms(word).terms).toEqual(["camera"]);
    for (const word of ["mic", "microphone"])
      expect(extractTerms(word).terms).toEqual(["mic"]);
  });

  test("offers closest guides instead of guessing when ambiguous", () => {
    const result = matchGuides("outlok");
    expect(result.status).not.toBe("confident");
    expect(result.best).toBeNull();
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
    expect(
      result.suggestions.every((issue) => issue.category === "email")
    ).toBe(true);
  });

  test.each([
    "my office chair is broken",
    "the coffee machine is broken",
    "my cat is sick",
    "",
  ])("returns no match for %j", (text) => {
    const result = matchGuides(text);
    expect(result.status).toBe("none");
    expect(result.best).toBeNull();
  });

  test("respects the platform filter and custom confidence floor", () => {
    const result = matchGuides("printer offline", { platform: "iOS" });
    expect(result.best?.issue.id).not.toBe("printer-offline");
    expect(
      matchGuides("printer offline", { minConfidence: 0.999 }).status
    ).toBe("weak");
  });
});
