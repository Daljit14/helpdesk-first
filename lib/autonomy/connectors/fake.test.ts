import { describe, expect, test } from "vitest";
import { FakeDirectory } from "./fake";

describe("fake identity directory", () => {
  test("supports lookup, membership, and writes", async () => {
    const directory = new FakeDirectory({
      directoryUserId: "user-1",
      primaryEmail: "person@example.com",
      enabled: true,
      suspended: false,
      passwordExpired: false,
      lastSignInAt: null,
      recentSignInErrors: [],
      mfaRegistered: true,
      groups: [],
    });
    expect((await directory.getUserById()).ok).toBe(true);
    await directory.addToGroup("user-1", "group-1");
    expect(await directory.isMemberOfGroup("user-1", "group-1")).toMatchObject({
      ok: true,
      value: true,
    });
    expect(
      await directory.getRiskFacts("user-1", new AbortController().signal)
    ).toEqual({
      ok: true,
      value: {
        privileged: null,
        mfaChangedAt: null,
        signIns: [],
        directoryPhone: null,
        managerName: null,
      },
    });
  });

  test("returns configurable risk facts", async () => {
    const facts = {
      privileged: true,
      mfaChangedAt: "2026-10-10T11:00:00.000Z",
      signIns: [{ at: "2026-10-10T10:00:00.000Z", country: "US" }],
      directoryPhone: "+1 555 0100",
      managerName: "manager@example.com",
    };
    const directory = new FakeDirectory(
      {
        directoryUserId: "user-1",
        primaryEmail: "person@example.com",
        enabled: true,
        suspended: false,
        passwordExpired: false,
        lastSignInAt: null,
        recentSignInErrors: [],
        mfaRegistered: true,
        groups: [],
      },
      "google",
      facts
    );
    expect(
      await directory.getRiskFacts("user-1", new AbortController().signal)
    ).toEqual({ ok: true, value: facts });
  });
});
