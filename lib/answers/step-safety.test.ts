import { describe, expect, test } from "vitest";
import { mapBlockedUserStepReason, screenAnswerStep } from "./step-safety";

describe("mapBlockedUserStepReason", () => {
  test.each([
    ["The step requests sensitive credentials.", "credentials"],
    ["The step asks to weaken a security tool.", "security_tool"],
    [
      "The step asks to install software that is not approved.",
      "unapproved_install",
    ],
  ] as const)("maps %s to %s", (message, reason) => {
    expect(mapBlockedUserStepReason(message)).toBe(reason);
  });

  test("fails closed for unknown block reasons", () => {
    expect(mapBlockedUserStepReason("A new unrecognized block reason.")).toBe(
      "security_tool"
    );
    expect(mapBlockedUserStepReason(null)).toBeNull();
  });
});

describe("screenAnswerStep", () => {
  test.each([
    ["credentials", "Enter your password when asked."],
    ["security_tool", "Turn off the firewall and retry."],
    ["registry_or_policy", "Change the HKEY_CURRENT_USER setting."],
    ["script_or_command", "Run `ipconfig /flushdns` in Command Prompt."],
    ["unapproved_install", "Install Zoom"],
    ["other_account", "Sign in to another user's account."],
    ["admin_rights", "Run this as administrator."],
    ["link", "Open https://example.com/help."],
  ] as const)("blocks %s content", (reason, text) => {
    expect(screenAnswerStep(text, [])).toBe(reason);
  });

  test.each([
    "Your password was reset recently.",
    "The firewall may block the app.",
    "Open Settings > Network",
    "Restart the app.",
    "Zoom is already installed.",
    "Open your account settings.",
    "Review account settings in the app.",
    "The app shows the domain as text but no address.",
  ])("allows benign near-miss text: %s", (text) => {
    expect(screenAnswerStep(text, [])).toBeNull();
  });

  test.each([
    [
      "their account",
      "Review their account settings.",
      "Review your account settings.",
    ],
    ["their password", "Reset their password.", "Reset your password."],
    ["their mailbox", "Open their mailbox.", "Open your mailbox."],
    [
      "sign in as another user",
      "Sign in as another user.",
      "Sign in to your account.",
    ],
    [
      "log in as someone else",
      "Log in as someone else.",
      "Log in to your account.",
    ],
    [
      "reset the password for another user",
      "Reset the password for another user.",
      "Reset the password for your account.",
    ],
    [
      "reset the password for a coworker",
      "Reset the password for a coworker.",
      "Restart your device.",
    ],
    [
      "reset the password for a colleague",
      "Reset the password for a colleague.",
      "Restart your device.",
    ],
    [
      "for another user without a following noun",
      "Open settings for another user.",
      "Open settings for your account.",
    ],
    [
      "as someone else without a following noun",
      "Open settings as someone else.",
      "Open settings as yourself.",
    ],
  ])(
    "blocks %s and allows its benign near-miss",
    (_pattern, text, nearMiss) => {
      expect(screenAnswerStep(text, [])).toBe("other_account");
      expect(screenAnswerStep(nearMiss, [])).toBeNull();
    }
  );

  test("allows installation only when the software is approved", () => {
    expect(screenAnswerStep("Install Zoom", ["Zoom"])).toBeNull();
    expect(screenAnswerStep("Install Zoom", ["Microsoft Teams"])).toBe(
      "unapproved_install"
    );
  });
});
