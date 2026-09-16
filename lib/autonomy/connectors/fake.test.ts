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
  });
});
