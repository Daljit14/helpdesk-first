import { describe, expect, test } from "vitest";
import { parseGoogleWorkspaceIncidents } from "./google-workspace";

describe("Google Workspace service health parser", () => {
  test("keeps active incidents, summarizes and validates deep links", () => {
    expect(
      parseGoogleWorkspaceIncidents([
        {
          id: "abc123",
          begin: "2026-10-04T12:00:00Z",
          end: null,
          service_name: "Gmail",
          status_impact: "SERVICE_OUTAGE",
          uri: "incidents/abc123",
          external_desc:
            "**Summary:** Gmail delivery delayed https://bad.example\nMore detail",
        },
        {
          id: "def456",
          end: "2026-10-04T13:00:00Z",
          service_name: "Calendar",
          status_impact: "SERVICE_DISRUPTION",
        },
        {
          id: "bad789",
          end: null,
          service_name: "Drive",
          status_impact: "UNKNOWN",
          uri: "https://evil.example",
        },
      ])
    ).toEqual([
      {
        source: "google_workspace",
        incidentId: "abc123",
        service: "Gmail",
        title: "Gmail delivery delayed",
        impact: "outage",
        startedAt: "2026-10-04T12:00:00.000Z",
        url: "https://www.google.com/appsstatus/dashboard/incidents/abc123",
      },
      {
        source: "google_workspace",
        incidentId: "bad789",
        service: "Drive",
        title: "Drive",
        impact: "informational",
        startedAt: null,
        url: "https://www.google.com/appsstatus/dashboard/",
      },
    ]);
  });
});
