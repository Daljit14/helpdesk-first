import { generateKeyPairSync } from "node:crypto";
import { expect, test, vi } from "vitest";
import { GoogleWorkspaceDirectory } from "./google-workspace";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  provider: "google" as const,
  organizationId: "org-1",
  config: { adminSubject: "admin@example.com" },
  secret: JSON.stringify({
    client_email: "service@example.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  }),
  allowedGroupIds: [],
  resetUrl: null,
};

test("Google Workspace acquires a delegated token and looks up by id", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }))
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "user-1",
          primaryEmail: "person@example.com",
          suspended: false,
          lastLoginTime: null,
          isEnrolledIn2Sv: true,
        })
      )
    );
  vi.stubGlobal("fetch", fetchMock);
  const result = await new GoogleWorkspaceDirectory(config).getUserById(
    "user-1",
    new AbortController().signal
  );
  expect(result).toMatchObject({
    ok: true,
    value: { directoryUserId: "user-1" },
  });
  vi.unstubAllGlobals();
});

test("Google Workspace maps full directory risk facts", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }))
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          isAdmin: false,
          isDelegatedAdmin: true,
          phones: [
            { value: "+1 555 0100", type: "work" },
            { value: "+1 555 0101", type: "mobile", primary: true },
          ],
          relations: [{ type: "manager", value: "manager@example.com" }],
        })
      )
    );
  vi.stubGlobal("fetch", fetchMock);

  const result = await new GoogleWorkspaceDirectory(config).getRiskFacts(
    "user-1",
    new AbortController().signal
  );

  expect(result).toEqual({
    ok: true,
    value: {
      privileged: true,
      mfaChangedAt: null,
      signIns: [],
      directoryPhone: "+1 555 0101",
      managerName: "manager@example.com",
    },
  });
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain("?projection=full");
  vi.unstubAllGlobals();
});

test("Google Workspace falls back through work and any phone numbers", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }))
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          phones: [
            { value: "+1 555 0100", type: "home" },
            { value: "+1 555 0101", type: "work" },
            { value: "+1 555 0102", type: "mobile" },
          ],
        })
      )
    );
  vi.stubGlobal("fetch", fetchMock);

  const result = await new GoogleWorkspaceDirectory(config).getRiskFacts(
    "user-1",
    new AbortController().signal
  );

  expect(result).toMatchObject({
    ok: true,
    value: {
      privileged: null,
      directoryPhone: "+1 555 0101",
      managerName: null,
    },
  });
  vi.unstubAllGlobals();
});
