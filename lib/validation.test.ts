import { describe, expect, test } from "vitest";
import { forgotPasswordSchema, resetPasswordSchema } from "./validation";

describe("forgotPasswordSchema", () => {
  test("accepts and normalizes a valid email", () => {
    expect(
      forgotPasswordSchema.parse({ email: "  USER@Example.COM " })
    ).toEqual({ email: "user@example.com" });
  });

  test("rejects an invalid email", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "not-an-email" }).success
    ).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  test("rejects mismatched passwords on confirmPassword", () => {
    const result = resetPasswordSchema.safeParse({
      password: "ValidPass1",
      confirmPassword: "DifferentPass1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path[0] === "confirmPassword" &&
            issue.message === "Passwords do not match."
        )
      ).toBe(true);
    }
  });

  test("rejects weak passwords", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "weak",
        confirmPassword: "weak",
      }).success
    ).toBe(false);
  });

  test("accepts a valid password pair", () => {
    expect(
      resetPasswordSchema.parse({
        password: "ValidPass1",
        confirmPassword: "ValidPass1",
      })
    ).toEqual({
      password: "ValidPass1",
      confirmPassword: "ValidPass1",
    });
  });
});
