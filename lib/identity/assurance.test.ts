import { describe, expect, test } from "vitest";
import { compareAssurance, computeAssurance } from "./assurance";

const now = new Date("2026-10-10T12:00:00.000Z");
const base = {
  channel: "web" as const,
  hasVerifiedSession: true,
  aal: null as "aal1" | "aal2" | null,
  amr: null,
  providers: [] as string[],
  org: {
    idpEnforcesMfa: false,
    ssoProvider: null as "entra" | "google" | "okta" | "none" | "other" | null,
    profileConfirmed: false,
  },
  freshMinutes: 10,
  now,
};

describe("assurance computation", () => {
  test("orders assurance levels", () => {
    expect(compareAssurance("A0", "A1")).toBeLessThan(0);
    expect(compareAssurance("A3", "A2")).toBeGreaterThan(0);
    expect(compareAssurance("A2", "A2")).toBe(0);
  });

  test.each([
    ["email", "channel_email"],
    ["api", "channel_api"],
  ] as const)("caps %s channels at A0", (channel, method) => {
    expect(
      computeAssurance({
        ...base,
        channel,
        aal: "aal2",
        amr: [{ method: "oauth", timestamp: now.getTime() / 1000 }],
      })
    ).toMatchObject({ level: "A0", method, authAt: null, expiresAt: null });
  });

  test("caps ticket-owner web at A1", () => {
    expect(
      computeAssurance({
        ...base,
        channel: "ticket_owner_web",
        amr: [{ method: "oauth", timestamp: now.getTime() / 1000 }],
      })
    ).toEqual({
      level: "A1",
      method: "ticket_owner_web",
      authAt: null,
      expiresAt: null,
    });
  });

  test("handles unverified and anonymous sessions", () => {
    expect(computeAssurance({ ...base, hasVerifiedSession: false })).toEqual({
      level: "A0",
      method: "unauthenticated",
      authAt: null,
      expiresAt: null,
    });
    expect(
      computeAssurance({
        ...base,
        amr: [{ method: "anonymous", timestamp: now.getTime() / 1000 }],
      })
    ).toMatchObject({ level: "A0", method: "anonymous" });
  });

  test("returns A1 for stale or timestamp-free authentication", () => {
    expect(
      computeAssurance({
        ...base,
        amr: ["password"],
      })
    ).toMatchObject({ level: "A1", method: "session" });
    expect(
      computeAssurance({
        ...base,
        amr: [
          {
            method: "password",
            timestamp: now.getTime() / 1000 - 11 * 60,
          },
        ],
      })
    ).toMatchObject({ level: "A1", method: "session" });
  });

  test("returns fresh A2 and ignores timestamps too far in the future", () => {
    const fresh = computeAssurance({
      ...base,
      amr: [
        {
          method: "password",
          timestamp: now.getTime() / 1000 - 30,
        },
      ],
    });
    expect(fresh).toMatchObject({ level: "A2", method: "password" });
    expect(fresh.expiresAt).toBe("2026-10-10T12:09:30.000Z");
    expect(
      computeAssurance({
        ...base,
        amr: [
          {
            method: "password",
            timestamp: now.getTime() / 1000 + 61,
          },
        ],
      })
    ).toMatchObject({ level: "A1", method: "session" });
  });

  test("supports recent Supabase MFA", () => {
    expect(
      computeAssurance({
        ...base,
        aal: "aal2",
        amr: [
          { method: "password", timestamp: now.getTime() / 1000 - 60 },
          { method: "mfa/totp", timestamp: now.getTime() / 1000 - 30 },
        ],
      })
    ).toMatchObject({ level: "A3", method: "supabase_mfa" });
  });

  test("requires a confirmed organization and one enforced OAuth provider", () => {
    const input = {
      ...base,
      providers: ["azure", "email"],
      amr: [{ method: "oauth", timestamp: now.getTime() / 1000 - 30 }],
      org: {
        idpEnforcesMfa: true,
        ssoProvider: "entra" as const,
        profileConfirmed: true,
      },
    };
    expect(computeAssurance(input)).toMatchObject({
      level: "A3",
      method: "idp_mfa_attested",
    });
    expect(
      computeAssurance({ ...input, providers: ["azure", "google", "email"] })
    ).toMatchObject({ level: "A2", method: "oauth" });
    expect(
      computeAssurance({
        ...input,
        amr: [{ method: "password", timestamp: now.getTime() / 1000 - 30 }],
      })
    ).toMatchObject({ level: "A2", method: "password" });
    expect(
      computeAssurance({
        ...input,
        providers: ["google", "email"],
        org: { ...input.org, ssoProvider: "google" },
      })
    ).toMatchObject({ level: "A2", method: "oauth" });
  });
});
