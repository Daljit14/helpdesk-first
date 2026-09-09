import { describe, expect, test } from "vitest";
import { ISSUES } from "@/lib/issues";
import { getIssueSteps } from "@/lib/steps";
import {
  STEP_RISK_OVERRIDES,
  classifyStep,
  getIssueStepPolicies,
  isOfferable,
  riskLabel,
} from "./policy";

describe("step policy", () => {
  test.each([
    ["Check that the volume is turned up and not muted.", "safe"],
    ["Restart the application.", "safe"],
    [
      "Clear temporary files and browser cache using built-in storage tools.",
      "caution",
    ],
    ["Change the DNS server to 8.8.8.8.", "approval"],
    ["Run SFC /scannow and DISM to repair system files.", "approval"],
    ["Install the software from the vendor website.", "approval"],
    ["Bypass the password or MFA prompt.", "denied"],
    ["Disable the antivirus and run the command in PowerShell.", "denied"],
    ["Flash the BIOS to the latest version.", "specialist"],
    ["Remove the malware manually.", "specialist"],
    ["Open a terminal and run arbitrary commands.", "denied"],
    ["Run a trusted antivirus or system scan.", "safe"],
    ["Run a full scan with the organization antimalware tool.", "safe"],
    [
      "Contact IT with any error code or message; do not change VPN server settings yourself.",
      "safe",
    ],
    [
      "If the installation still fails, contact IT with the exact error message.",
      "safe",
    ],
    [
      "If the device still does not start, contact your IT support team.",
      "safe",
    ],
    ["Disable the antivirus and run the command in PowerShell.", "denied"],
    ["Download the installer again in case the file is corrupted.", "caution"],
    [
      "Check that you have enough free disk space for the installation.",
      "safe",
    ],
    ["Confirm the app has the latest update from the app store.", "safe"],
    ["Check for and install pending operating-system updates.", "safe"],
    ["Update or reinstall the device driver.", "approval"],
    [
      "Check for software or driver updates for your wireless adapter.",
      "caution",
    ],
    ["Check for operating system audio driver updates.", "caution"],
    ["Factory reset the device.", "approval"],
    ["Install the latest security updates.", "safe"],
    [
      "Restart the computer to clear temporary files and refresh memory.",
      "safe",
    ],
    ["Restart the computer or mobile device.", "safe"],
    ["Save any open work and restart the computer.", "safe"],
  ])("%s => %s", (text, risk) => {
    expect(classifyStep(text).risk).toBe(risk);
  });

  test("curated overrides win over generic rules", () => {
    const issue = ISSUES[0]!;
    STEP_RISK_OVERRIDES[issue.id] = { 0: "safe" };
    try {
      expect(getIssueStepPolicies(issue)[0]?.risk).toBe("safe");
    } finally {
      delete STEP_RISK_OVERRIDES[issue.id];
    }
  });

  test("uses the requester and staff offerability matrix", () => {
    expect(isOfferable("safe", "requester")).toBe(true);
    expect(isOfferable("caution", "requester")).toBe(true);
    expect(isOfferable("approval", "requester")).toBe(false);
    expect(isOfferable("approval", "staff")).toBe(true);
    expect(isOfferable("specialist", "staff")).toBe(false);
    expect(isOfferable("denied", "staff")).toBe(false);
  });

  test("has stable labels", () => {
    expect(riskLabel("safe")).toBe("Safe");
    expect(riskLabel("caution")).toBe("Confirm first");
    expect(riskLabel("approval")).toBe("Requires IT approval");
    expect(riskLabel("specialist")).toBe("Specialist only");
    expect(riskLabel("denied")).toBe("Not allowed");
  });

  test("catalog classifications are safe to evaluate and never denied", () => {
    const hits: string[] = [];
    for (const issue of ISSUES) {
      for (const text of getIssueSteps(issue)) {
        const classification = classifyStep(text);
        expect(() => classifyStep(text)).not.toThrow();
        if (
          classification.risk === "approval" ||
          classification.risk === "specialist"
        ) {
          hits.push(`${text} -> ${classification.risk}`);
        }
        expect(classification.risk).not.toBe("denied");
      }
    }
    expect(hits).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Restart the computer in safe mode"),
        expect.stringContaining("Update or reinstall the device driver."),
        expect.stringContaining(
          "reinstall the application from an approved source"
        ),
        expect.stringContaining(
          "Run the installer from an administrator account"
        ),
      ])
    );
  });
});
