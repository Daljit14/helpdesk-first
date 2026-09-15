import { describe, expect, test } from "vitest";
import { isMoreRestrictive, POLICY_PRECEDENCE } from "./types";

describe("policy precedence", () => {
  test("adding a restrictive decision never makes a result less restrictive", () => {
    for (const current of POLICY_PRECEDENCE) {
      for (const added of POLICY_PRECEDENCE) {
        const result = isMoreRestrictive(added, current) ? added : current;
        expect(isMoreRestrictive(result, current)).toBe(true);
      }
    }
  });

  test("precedence is ordered from deny to automatic execution", () => {
    for (let index = 1; index < POLICY_PRECEDENCE.length; index += 1) {
      expect(
        isMoreRestrictive(
          POLICY_PRECEDENCE[index - 1],
          POLICY_PRECEDENCE[index]
        )
      ).toBe(true);
    }
  });
});
