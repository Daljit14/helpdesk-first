import { describe, expect, test, vi } from "vitest";
import { EntraDirectory } from "./entra";

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

const config = {
  provider: "entra" as const,
  organizationId: "org-1",
  config: { tenantId: "tenant-1", clientId: "client-1" },
  secret: "connector-secret",
  allowedGroupIds: [],
  resetUrl: null,
};

describe("Entra directory connector", () => {
  test("acquires a token and escapes email filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        response({
          value: [
            {
              id: "user-1",
              mail: "person@example.com",
              accountEnabled: true,
            },
          ],
        })
      )
      .mockResolvedValue(response({ value: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new EntraDirectory(config).lookupUserByEmail(
      "person@example.com",
      new AbortController().signal
    );
    expect(result).toMatchObject({ ok: true });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("mail%20eq");
    vi.unstubAllGlobals();
  });

  test("maps retried server failures to ConnectorError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new EntraDirectory(config).getUserById(
      "user-1",
      new AbortController().signal
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
