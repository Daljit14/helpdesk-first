import { describe, expect, test } from "vitest";
import {
  RUN_STATUSES,
  TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
} from "./state-machine";

describe("autonomy state machine", () => {
  test("matches the declared transition table", () => {
    for (const from of RUN_STATUSES) {
      for (const to of RUN_STATUSES) {
        expect(canTransition(from, to)).toBe(TRANSITIONS[from].includes(to));
      }
    }
  });

  test("requires verification before resolved", () => {
    expect(canTransition("executing", "resolved")).toBe(false);
    expect(() => assertTransition("executing", "resolved")).toThrow(
      "Illegal autonomy transition"
    );
  });

  test("allows verified runs to plan another bounded step", () => {
    expect(canTransition("verified", "planning")).toBe(true);
    expect(() => assertTransition("verified", "planning")).not.toThrow();
  });

  test("terminal states have no outgoing transitions", () => {
    for (const status of RUN_STATUSES.filter(isTerminal)) {
      expect(TRANSITIONS[status]).toEqual([]);
    }
  });

  test("every non-terminal state can pause or escalate", () => {
    for (const status of RUN_STATUSES.filter((value) => !isTerminal(value))) {
      if (status !== "paused") {
        expect(canTransition(status, "paused")).toBe(true);
      }
      expect(canTransition(status, "escalated")).toBe(true);
    }
  });

  test("paused runs cannot resolve directly", () => {
    expect(canTransition("paused", "resolved")).toBe(false);
  });
});
