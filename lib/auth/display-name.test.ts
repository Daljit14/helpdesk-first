import { describe, expect, test } from "vitest";
import { getDisplayName, getFirstName } from "./display-name";

describe("getDisplayName", () => {
  test("prefers full_name metadata", () => {
    expect(
      getDisplayName({
        email: "ada@example.com",
        user_metadata: { full_name: "  Ada   Lovelace " },
      })
    ).toBe("Ada Lovelace");
  });

  test("falls back to the email local part", () => {
    expect(getDisplayName({ email: "grace.hopper@example.com" })).toBe(
      "grace.hopper"
    );
    expect(
      getDisplayName({
        email: "sam@example.com",
        user_metadata: { full_name: " " },
      })
    ).toBe("sam");
  });

  test("handles missing users", () => {
    expect(getDisplayName(null)).toBe("Account");
    expect(getDisplayName({ email: null })).toBe("Account");
  });
});

describe("getFirstName", () => {
  test("returns the first word of full_name", () => {
    expect(getFirstName({ user_metadata: { full_name: "Ada Lovelace" } })).toBe(
      "Ada"
    );
  });

  test("never guesses from email", () => {
    expect(getFirstName({ email: "ada@example.com" })).toBeNull();
    expect(getFirstName({ user_metadata: { full_name: 42 } })).toBeNull();
  });
});
