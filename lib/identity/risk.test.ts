import { describe, expect, test } from "vitest";
import { CAPABILITIES } from "@/lib/autonomy/capabilities/registry";
import {
  assessAccountRisk,
  isAccountCapability,
  isFreshA3Since,
  namesOtherPerson,
  type AccountRiskFacts,
} from "./risk";

const now = new Date("2026-10-10T12:00:00.000Z");
const baseFacts: AccountRiskFacts = {
  priorAccountRequests24h: 0,
  mfaChangedAt: null,
  signIns: [],
  newestDeviceEnrolledAt: null,
  namesOtherPerson: false,
  privileged: null,
};

describe("assessAccountRisk", () => {
  test.each([
    ["repeat request", { priorAccountRequests24h: 1 }, "high"],
    ["no repeat request", { priorAccountRequests24h: 0 }, "none"],
    ["unknown repeat lookup", { priorAccountRequests24h: null }, "high"],
    [
      "recent MFA change",
      { mfaChangedAt: "2026-10-06T12:00:00.000Z" },
      "elevated",
    ],
    ["future MFA change", { mfaChangedAt: "2026-10-10T12:00:00.001Z" }, "none"],
    ["old MFA change", { mfaChangedAt: "2026-10-02T11:59:59.999Z" }, "none"],
    [
      "recent enrolled device",
      { newestDeviceEnrolledAt: "2026-10-09T12:00:00.000Z" },
      "elevated",
    ],
    [
      "future enrolled device",
      { newestDeviceEnrolledAt: "2026-10-10T12:00:00.001Z" },
      "none",
    ],
    [
      "old enrolled device",
      { newestDeviceEnrolledAt: "2026-10-09T11:59:59.999Z" },
      "none",
    ],
    ["other person", { namesOtherPerson: true }, "high"],
    ["privileged", { privileged: true }, "high"],
    ["not privileged", { privileged: false }, "none"],
    ["unknown privileged status", { privileged: null }, "none"],
  ] as const)("assesses %s", (_label, facts, level) => {
    expect(
      assessAccountRisk({
        facts: { ...baseFacts, ...facts },
        now,
      }).level
    ).toBe(level);
  });

  test("detects a new country only when an older comparison window exists", () => {
    const signIns = [
      { at: "2026-10-01T12:00:00.000Z", country: "US" },
      { at: "2026-10-10T10:00:00.000Z", country: "CA" },
    ];
    expect(
      assessAccountRisk({
        facts: { ...baseFacts, signIns },
        now,
      })
    ).toEqual({ level: "elevated", reasons: ["new_sign_in_country"] });
    expect(
      assessAccountRisk({
        facts: {
          ...baseFacts,
          signIns: [{ at: "2026-10-10T10:00:00.000Z", country: "CA" }],
        },
        now,
      })
    ).toEqual({ level: "none", reasons: [] });
    expect(
      assessAccountRisk({
        facts: {
          ...baseFacts,
          signIns: [
            { at: "2026-10-01T12:00:00.000Z", country: "CA" },
            { at: "2026-10-10T10:00:00.000Z", country: "CA" },
          ],
        },
        now,
      })
    ).toEqual({ level: "none", reasons: [] });
  });

  test("detects impossible travel only for different recent countries within two hours", () => {
    const assess = (signIns: AccountRiskFacts["signIns"]) =>
      assessAccountRisk({ facts: { ...baseFacts, signIns }, now });
    expect(
      assess([
        { at: "2026-10-10T10:00:00.000Z", country: "US" },
        { at: "2026-10-10T12:00:00.000Z", country: "CA" },
      ])
    ).toEqual({ level: "elevated", reasons: ["impossible_travel"] });
    expect(
      assess([
        { at: "2026-10-10T09:59:59.999Z", country: "US" },
        { at: "2026-10-10T12:00:00.000Z", country: "CA" },
      ])
    ).toEqual({ level: "none", reasons: [] });
    expect(
      assess([
        { at: "2026-10-10T10:00:00.000Z", country: "US" },
        { at: "2026-10-10T11:00:00.000Z", country: "US" },
      ])
    ).toEqual({ level: "none", reasons: [] });
  });

  test("combines signal levels and returns reasons in enum order", () => {
    expect(
      assessAccountRisk({
        facts: {
          priorAccountRequests24h: 2,
          mfaChangedAt: "2026-10-10T11:00:00.000Z",
          signIns: [
            { at: "2026-10-01T12:00:00.000Z", country: "US" },
            { at: "2026-10-10T10:00:00.000Z", country: "CA" },
            { at: "2026-10-10T11:00:00.000Z", country: "US" },
          ],
          newestDeviceEnrolledAt: "2026-10-10T11:30:00.000Z",
          namesOtherPerson: true,
          privileged: true,
        },
        now,
      })
    ).toEqual({
      level: "high",
      reasons: [
        "repeat_account_request_24h",
        "mfa_changed_7d",
        "new_sign_in_country",
        "impossible_travel",
        "new_device_24h",
        "names_other_person",
        "privileged_account",
      ],
    });
  });
});

describe("namesOtherPerson", () => {
  test.each([
    [
      "other email",
      ["Please reset access for alex@example.com."],
      "me@example.com",
    ],
    ["colleague", ["Please handle this for my colleague."], "me@example.com"],
    ["their password", ["They need their password reset."], "me@example.com"],
  ])("detects %s", (_label, texts, email) => {
    expect(namesOtherPerson(texts, email)).toBe(true);
  });

  test("does not treat the requester's case-insensitive email as another person", () => {
    expect(
      namesOtherPerson(["My address is ME@EXAMPLE.COM."], "me@example.com")
    ).toBe(false);
  });

  test("does not treat ordinary personal requests as another person", () => {
    expect(
      namesOtherPerson(["Please reset my password."], "me@example.com")
    ).toBe(false);
  });
});

describe("isAccountCapability", () => {
  test("matches the A3 identity-bound account capabilities", () => {
    expect(
      CAPABILITIES.filter(isAccountCapability)
        .map((capability) => capability.id)
        .sort()
    ).toEqual([
      "grant_group_access",
      "revoke_user_sessions",
      "send_password_reset_link",
    ]);
  });
});

describe("isFreshA3Since", () => {
  const assurance = {
    level: "A3" as const,
    method: "passkey",
    authAt: "2026-10-10T11:00:00.000Z",
    expiresAt: "2026-10-10T13:00:00.000Z",
  };

  test("accepts A3 assurance authenticated since the boundary and not expired", () => {
    expect(
      isFreshA3Since(assurance, {
        since: "2026-10-10T10:00:00.000Z",
        now,
      })
    ).toBe(true);
  });

  test("rejects assurance from before the boundary or that has expired", () => {
    expect(
      isFreshA3Since(assurance, {
        since: "2026-10-10T11:00:00.001Z",
        now,
      })
    ).toBe(false);
    expect(
      isFreshA3Since(
        { ...assurance, expiresAt: "2026-10-10T11:59:59.999Z" },
        { since: "2026-10-10T10:00:00.000Z", now }
      )
    ).toBe(false);
  });
});
