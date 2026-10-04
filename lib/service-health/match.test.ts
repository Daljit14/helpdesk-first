import { describe, expect, test } from "vitest";
import { matchIncidents } from "./match";
import type { ServiceIncident } from "./types";

const incident = (
  service: string,
  title: string,
  impact: ServiceIncident["impact"]
): ServiceIncident => ({
  source: "microsoft365",
  incidentId: `${service}:${title}`.replaceAll(" ", "-"),
  service,
  title,
  impact,
  startedAt: null,
  url: "https://admin.microsoft.com/Adminportal/Home#/servicehealth",
});

describe("matchIncidents", () => {
  test("matches Outlook to Exchange, ignores informational and unrelated issues", () => {
    const candidates = [
      incident("Exchange Online", "Mail delivery delayed", "degraded"),
      incident("Outlook", "Maintenance", "informational"),
      incident("SharePoint", "File sync degraded", "outage"),
    ];
    expect(matchIncidents("Outlook email is unavailable", candidates)).toEqual([
      candidates[0],
    ]);
  });

  test("sorts outages first and caps the result", () => {
    const candidates = Array.from({ length: 7 }, (_, index) =>
      incident(
        "Gmail",
        `Mail issue ${index}`,
        index === 5 ? "outage" : "degraded"
      )
    );
    const matches = matchIncidents("My mail is down", candidates);
    expect(matches).toHaveLength(5);
    expect(matches[0]).toBe(candidates[5]);
  });

  test("uses service containment only for names at least four characters long", () => {
    const short = incident("MFA", "Unavailable", "outage");
    const service = incident("Custom Portal", "Unavailable", "degraded");
    expect(
      matchIncidents("The custom portal is unavailable", [short, service])
    ).toEqual([service]);
  });
});
