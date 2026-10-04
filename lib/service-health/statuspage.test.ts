import { describe, expect, test } from "vitest";
import { parseStatuspageIncidents } from "./statuspage";

const source = {
  id: "status-source",
  name: "Contoso Mail",
  base_url: "https://status.example.com",
  enabled: true,
};

describe("Statuspage incident parser", () => {
  test("maps impacts and uses only configured or stspg.io links", () => {
    expect(
      parseStatuspageIncidents(
        {
          page: { name: "Example", url: "https://status.example.com" },
          incidents: [
            {
              id: "one",
              name: "**Mail** <b>outage</b>",
              impact: "critical",
              shortlink: "https://stspg.io/abc",
              started_at: "2026-10-04T12:00:00Z",
              components: [],
            },
            {
              id: "two",
              name: "Minor incident",
              impact: "minor",
              shortlink: "https://evil.example/incidents/two",
              components: [],
            },
          ],
        },
        source,
        source.base_url
      )
    ).toEqual([
      {
        source: "statuspage",
        incidentId: "one",
        service: "Contoso Mail",
        title: "Mail outage",
        impact: "outage",
        startedAt: "2026-10-04T12:00:00.000Z",
        url: "https://stspg.io/abc",
      },
      {
        source: "statuspage",
        incidentId: "two",
        service: "Contoso Mail",
        title: "Minor incident",
        impact: "degraded",
        startedAt: null,
        url: source.base_url,
      },
    ]);
  });
});
