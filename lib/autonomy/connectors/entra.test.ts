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

function serviceHealthIssue(id: string) {
  return {
    id,
    title: `Issue ${id}`,
    service: "Exchange Online",
    status: "serviceDegradation",
    isResolved: false,
    classification: "incident",
    startDateTime: "2026-10-04T12:00:00Z",
  };
}

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

  test("maps independent Entra risk signals and the 30-day sign-in query", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("login.microsoftonline.com"))
        return response({ access_token: "token", expires_in: 3600 });
      if (url.includes("/authentication/methods"))
        return response({
          value: [
            { id: "method-1", createdDateTime: "2026-10-03T12:00:00Z" },
            { id: "method-2", createdDateTime: "2026-10-05T12:00:00Z" },
          ],
        });
      if (url.includes("/memberOf/microsoft.graph.directoryRole"))
        return response({ value: [{ id: "role-1" }] });
      if (url.includes("/manager"))
        return response({ displayName: "Manager Name" });
      if (url.includes("/auditLogs/signIns"))
        return response({
          value: [
            {
              createdDateTime: "2026-10-10T10:00:00Z",
              location: { countryOrRegion: "US" },
            },
            {
              createdDateTime: "2026-10-09T10:00:00Z",
              location: { countryOrRegion: "" },
            },
          ],
        });
      return response({ businessPhones: ["+1 555 0100"], mobilePhone: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new EntraDirectory(config).getRiskFacts(
      "user-1",
      new AbortController().signal
    );

    expect(result).toEqual({
      ok: true,
      value: {
        privileged: true,
        mfaChangedAt: "2026-10-05T12:00:00Z",
        signIns: [{ at: "2026-10-10T10:00:00Z", country: "US" }],
        directoryPhone: "+1 555 0100",
        managerName: "Manager Name",
      },
    });
    const signInsUrl = String(
      fetchMock.mock.calls.find((call) =>
        String(call[0]).includes("/auditLogs/signIns")
      )?.[0]
    );
    expect(signInsUrl).toContain("$top=50");
    expect(signInsUrl).toContain("createdDateTime");
    expect(signInsUrl).toContain("userId%20eq");
    vi.unstubAllGlobals();
  });

  test("keeps Entra risk subcall failures unknown without failing the result", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("login.microsoftonline.com"))
        return response({ access_token: "token", expires_in: 3600 });
      if (
        url.includes("/manager") ||
        url.includes("/authentication/methods") ||
        url.includes("/memberOf/microsoft.graph.directoryRole")
      )
        return response({}, 403);
      if (url.includes("/auditLogs/signIns"))
        return response({
          value: [
            {
              createdDateTime: "2026-10-10T10:00:00Z",
              location: { countryOrRegion: "CA" },
            },
          ],
        });
      return response({ businessPhones: ["+1 555 0100"] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new EntraDirectory(config).getRiskFacts(
      "user-1",
      new AbortController().signal
    );

    expect(result).toEqual({
      ok: true,
      value: {
        privileged: null,
        mfaChangedAt: null,
        signIns: [{ at: "2026-10-10T10:00:00Z", country: "CA" }],
        directoryPhone: "+1 555 0100",
        managerName: null,
      },
    });
    vi.unstubAllGlobals();
  });

  test("paginates Microsoft 365 service-health issues", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        response({
          value: [serviceHealthIssue("issue-1")],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$skiptoken=page-2",
        })
      )
      .mockResolvedValueOnce(
        response({ value: [serviceHealthIssue("issue-2")] })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new EntraDirectory(config).listServiceHealthIssues(
      new AbortController().signal
    );

    expect(result).toEqual({
      ok: true,
      value: [serviceHealthIssue("issue-1"), serviceHealthIssue("issue-2")],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/admin/serviceAnnouncement/issues?$select=id,title,service,status,isResolved,classification,startDateTime"
    );
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$skiptoken=page-2"
    );
    vi.unstubAllGlobals();
  });

  test("ignores a next link outside Microsoft Graph v1.0", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        response({
          value: [serviceHealthIssue("issue-1")],
          "@odata.nextLink":
            "https://evil.example/v1.0/admin/serviceAnnouncement/issues",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new EntraDirectory(config).listServiceHealthIssues(
      new AbortController().signal
    );

    expect(result).toEqual({
      ok: true,
      value: [serviceHealthIssue("issue-1")],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  test("caps service-health pagination at five pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ access_token: "token", expires_in: 3600 })
      );
    for (let page = 1; page <= 5; page += 1) {
      fetchMock.mockResolvedValueOnce(
        response({
          value: [serviceHealthIssue(`issue-${page}`)],
          "@odata.nextLink": `https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$skiptoken=page-${page + 1}`,
        })
      );
    }
    vi.stubGlobal("fetch", fetchMock);

    const result = await new EntraDirectory(config).listServiceHealthIssues(
      new AbortController().signal
    );

    expect(result).toMatchObject({
      ok: true,
      value: Array.from({ length: 5 }, (_, index) =>
        serviceHealthIssue(`issue-${index + 1}`)
      ),
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    vi.unstubAllGlobals();
  });

  test("returns a failure when a service-health page fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        response({
          value: [serviceHealthIssue("issue-1")],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$skiptoken=page-2",
        })
      )
      .mockResolvedValue(response({}, 503));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new EntraDirectory(config).listServiceHealthIssues(
      new AbortController().signal
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
    vi.unstubAllGlobals();
  });
});
