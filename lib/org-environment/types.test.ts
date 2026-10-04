import { describe, expect, test } from "vitest";
import { orgEnvironmentInputSchema } from "./types";

const validInput = {
  vpnClient: "  VPN Client  ",
  mdmProvider: "intune",
  emailStack: "microsoft365",
  chatStack: "teams",
  ssoProvider: "entra",
  standardPlatforms: ["Windows"],
  standardOsVersions: [" Windows 11 "],
  printerFleet: [" HP LaserJet "],
  approvedSoftware: [" Browser "],
};

describe("orgEnvironmentInputSchema", () => {
  test("accepts the defined enums and strictly rejects unknown fields", () => {
    expect(orgEnvironmentInputSchema.safeParse(validInput).success).toBe(true);
    expect(
      orgEnvironmentInputSchema.safeParse({
        ...validInput,
        mdmProvider: "unknown",
      }).success
    ).toBe(false);
    expect(
      orgEnvironmentInputSchema.safeParse({
        ...validInput,
        extra: "field",
      }).success
    ).toBe(false);
  });

  test("trims text, strips controls, and removes duplicate entries", () => {
    const parsed = orgEnvironmentInputSchema.parse({
      ...validInput,
      standardPlatforms: ["Windows", "Windows"],
      vpnClient: "  VPN\u0000 Client  ",
      standardOsVersions: [" Windows 11 ", "Windows 11"],
      printerFleet: [" HP LaserJet ", "HP LaserJet"],
      approvedSoftware: [" Browser ", "Browser"],
    });
    expect(parsed).toMatchObject({
      vpnClient: "VPN Client",
      standardPlatforms: ["Windows"],
      standardOsVersions: ["Windows 11"],
      printerFleet: ["HP LaserJet"],
      approvedSoftware: ["Browser"],
    });
  });

  test("enforces text length and every SQL array cap", () => {
    const longVpn = orgEnvironmentInputSchema.safeParse({
      ...validInput,
      vpnClient: `v${"x".repeat(80)}`,
    });
    expect(longVpn.success).toBe(true);
    if (longVpn.success) expect(longVpn.data.vpnClient).toHaveLength(80);
    expect(
      orgEnvironmentInputSchema.safeParse({
        ...validInput,
        standardPlatforms: [
          "Windows",
          "Mac",
          "iOS",
          "Android",
          "Other",
          "Windows",
        ],
      }).success
    ).toBe(false);
    expect(
      orgEnvironmentInputSchema.safeParse({
        ...validInput,
        standardOsVersions: Array.from({ length: 11 }, (_, i) => `OS ${i}`),
      }).success
    ).toBe(false);
    expect(
      orgEnvironmentInputSchema.safeParse({
        ...validInput,
        printerFleet: Array.from({ length: 21 }, (_, i) => `Printer ${i}`),
      }).success
    ).toBe(false);
    expect(
      orgEnvironmentInputSchema.safeParse({
        ...validInput,
        approvedSoftware: Array.from({ length: 51 }, (_, i) => `App ${i}`),
      }).success
    ).toBe(false);
    const longVersion = orgEnvironmentInputSchema.safeParse({
      ...validInput,
      standardOsVersions: ["v".repeat(41)],
    });
    expect(longVersion.success).toBe(true);
    if (longVersion.success) {
      expect(longVersion.data.standardOsVersions[0]).toHaveLength(40);
    }
  });
});
