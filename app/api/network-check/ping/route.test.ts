import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("network check ping route", () => {
  it("rate limits each client IP", async () => {
    const ip = "203.0.113.42";
    const responses: Response[] = [];

    for (let i = 0; i < 61; i++) {
      responses.push(
        await GET(
          new Request("http://localhost/api/network-check/ping", {
            headers: { "x-forwarded-for": ip },
          })
        )
      );
    }

    expect(
      responses.slice(0, 60).every((response) => response.status === 200)
    ).toBe(true);
    expect(responses[60].status).toBe(429);
    expect(responses[60].headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});
