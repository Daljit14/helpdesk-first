import { afterEach, describe, expect, test, vi } from "vitest";
import { researchFetch } from "./http";

describe("research HTTP transport", () => {
  afterEach(() => vi.restoreAllMocks());

  test("rejects oversized responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => String(256 * 1024 + 1),
        },
        text: async () => "oversized",
      })
    );
    const result = await researchFetch(
      "https://example.com",
      {},
      (json) => json,
      new AbortController().signal
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: "too_large", message: "Research response too large" },
    });
  });
});
