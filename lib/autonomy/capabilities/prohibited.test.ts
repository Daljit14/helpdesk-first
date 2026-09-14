import { describe, expect, test } from "vitest";
import {
  assertNotProhibited,
  findProhibited,
  PROHIBITED_PATTERNS,
} from "./prohibited";
import { CAPABILITIES } from "./registry";

const positiveExamples = [
  "Run powershell command",
  "Run raw SQL query",
  "Edit the Windows registry",
  "Change BIOS settings",
  "Reset the password",
  "Remove malware",
  "File recovery",
  "Use remote desktop",
  "Disable the firewall",
  "Format the disk",
];

describe("prohibited capability actions", () => {
  test("matches one example for every prohibited category", () => {
    expect(positiveExamples).toHaveLength(PROHIBITED_PATTERNS.length);
    for (const example of positiveExamples) {
      expect(findProhibited(example)).not.toBeNull();
    }
  });

  test("does not match approved capability descriptions or benign operations", () => {
    for (const definition of CAPABILITIES) {
      expect(findProhibited(definition.description)).toBeNull();
    }
    for (const description of [
      "Resend the ticket notification",
      "Retry a failed notification",
      "Read the attachment scan verdict",
      "Search approved knowledge",
    ]) {
      expect(findProhibited(description)).toBeNull();
    }
  });

  test("assertNotProhibited rejects prohibited definitions", () => {
    expect(() =>
      assertNotProhibited({
        id: "run_shell",
        description: "Run shell commands.",
      })
    ).toThrow();
  });
});
