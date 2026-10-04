import { describe, expect, test } from "vitest";
import { mapMicrosoft365Issues } from "./microsoft365";

describe("Microsoft 365 service health parser", () => {
  test("keeps unresolved items and sanitizes their fields", () => {
    expect(
      mapMicrosoft365Issues([
        {
          id: "inc-1",
          title: "**Exchange** <b>delayed</b> https://bad.example",
          service: "Exchange Online",
          status: "serviceDegradation",
          isResolved: false,
          classification: "Incident",
          startDateTime: "2026-10-04T12:00:00Z",
        },
        {
          id: "inc-2",
          title: "Resolved",
          service: "Outlook",
          isResolved: true,
          classification: "advisory",
        },
      ])
    ).toEqual([
      {
        source: "microsoft365",
        incidentId: "inc-1",
        service: "Exchange Online",
        title: "Exchange delayed",
        impact: "outage",
        startedAt: "2026-10-04T12:00:00.000Z",
        url: "https://admin.microsoft.com/Adminportal/Home#/servicehealth",
      },
    ]);
  });
});
