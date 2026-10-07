import { describe, expect, test } from "vitest";
import { screenAnswerStep } from "./step-safety";

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

  test("allows installation only when the software is approved", () => {
    expect(screenAnswerStep("Install Zoom", ["Zoom"])).toBeNull();
    expect(screenAnswerStep("Install Zoom", ["Microsoft Teams"])).toBe(
      "unapproved_install"
    );
  });
});
