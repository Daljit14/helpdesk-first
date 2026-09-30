import { describe, expect, test } from "vitest";
import {
  acceptedTerms,
  fullNameError,
  jobTitleError,
  passwordStrength,
  primaryDeviceError,
} from "./signup-fields";

describe("signup field rules", () => {
  test("full name is required and plain", () => {
    expect(fullNameError("")).toBe("Enter your full name.");
    expect(fullNameError("  ")).toBe("Enter your full name.");
    expect(fullNameError("Ada Lovelace")).toBeNull();
    expect(fullNameError("<b>x</b>")).not.toBeNull();
    expect(fullNameError("a".repeat(81))).not.toBeNull();
  });

  test("job title is optional", () => {
    expect(jobTitleError("")).toBeNull();
    expect(jobTitleError("Finance")).toBeNull();
    expect(jobTitleError("x".repeat(101))).not.toBeNull();
  });

  test("primary device must be a known device when given", () => {
    expect(primaryDeviceError("")).toBeNull();
    expect(primaryDeviceError("Mac")).toBeNull();
    expect(primaryDeviceError("Toaster")).not.toBeNull();
  });

  test("terms checkbox values", () => {
    expect(acceptedTerms("on")).toBe(true);
    expect(acceptedTerms(true)).toBe(true);
    expect(acceptedTerms(null)).toBe(false);
    expect(acceptedTerms("")).toBe(false);
  });

  test("password strength", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("abc")).toMatchObject({
      score: 1,
      label: "Too weak",
    });
    expect(passwordStrength("Password1").label).toBe("Fair");
    expect(passwordStrength("Longpassword12").label).toBe("Good");
    expect(passwordStrength("Longer-password-123").label).toBe("Strong");
  });
});
