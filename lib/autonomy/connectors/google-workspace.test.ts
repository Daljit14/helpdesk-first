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
