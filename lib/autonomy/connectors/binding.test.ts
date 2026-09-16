import { describe, expect, test } from "vitest";
import { hashEmail } from "./binding";

describe("identity binding helpers", () => {
  test("normalizes email before hashing", () => {
    expect(hashEmail(" Person@Example.com ")).toBe(
      hashEmail("person@example.com")
    );
  });
});
