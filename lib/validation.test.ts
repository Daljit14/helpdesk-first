import { describe, expect, test } from "vitest";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signUpSchema,
} from "./validation";

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

describe("signUpSchema", () => {
  test("reports one canonical empty-password error", () => {
    const result = signUpSchema.safeParse({
      email: "person@example.com",
      password: "",
      confirmPassword: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.filter((issue) => issue.path[0] === "password")
      ).toEqual([expect.objectContaining({ message: "Enter a password." })]);
      expect(
        result.error.issues.find((issue) => issue.path[0] === "confirmPassword")
          ?.message
      ).toBe("Confirm your password.");
    }
  });

  test("aggregates password strength failures", () => {
    const result = signUpSchema.safeParse({
      email: "person@example.com",
      password: "abc",
      confirmPassword: "abc",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["password"],
          message:
            "Password must be at least 8 characters and include an uppercase letter, a number.",
        })
      );
    }
  });

  test("rejects an empty email and mismatched confirmation", () => {
    expect(
      signUpSchema.safeParse({
        email: "",
        password: "ValidPass1",
        confirmPassword: "",
      }).error?.issues
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["email"],
          message: "Enter your email address.",
        }),
        expect.objectContaining({
          path: ["confirmPassword"],
          message: "Confirm your password.",
        }),
      ])
    );
    expect(
      signUpSchema.safeParse({
        email: "person@example.com",
        password: "ValidPass1",
        confirmPassword: "OtherPass1",
      }).error?.issues
    ).toContainEqual(
      expect.objectContaining({
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      })
    );
  });
});
