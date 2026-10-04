import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchStatusJson } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("service health HTTP transport", () => {
  test("rejects oversized content-length and body responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("{}", {
            headers: { "content-length": String(256 * 1024 + 1) },
          })
        )
        .mockResolvedValueOnce(new Response("x".repeat(256 * 1024 + 1)))
    );
    const signal = new AbortController().signal;
    const headerResult = await fetchStatusJson(
      "https://example.com",
      (x) => x,
      signal
    );
    const bodyResult = await fetchStatusJson(
      "https://example.com",
      (x) => x,
      signal
    );
    expect(headerResult).toEqual({
      ok: false,
      error: { kind: "too_large" },
    });
    expect(bodyResult).toEqual({
      ok: false,
      error: { kind: "too_large" },
    });
  });

  test("blocks unauthorized responses without retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchStatusJson(
      "https://example.com",
      (value) => value,
      new AbortController().signal
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: "unauthorized" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("retries a server error once and omits credentials and redirects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchStatusJson(
      "https://example.com",
      (value) => value,
      new AbortController().signal
    );
    expect(result).toEqual({ ok: true, value: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      redirect: "error",
      credentials: "omit",
      method: "GET",
    });
  });

  test("never throws for invalid JSON, parser errors, or fetch errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("{"))
        .mockResolvedValueOnce(new Response("{}"))
        .mockRejectedValueOnce(new Error("network"))
    );
    const signal = new AbortController().signal;
    expect(
      await fetchStatusJson("https://example.com", (value) => value, signal)
    ).toMatchObject({ ok: false });
    expect(
      await fetchStatusJson(
        "https://example.com",
        () => {
          throw new Error("parse");
        },
        signal
      )
    ).toMatchObject({ ok: false });
    await expect(
      fetchStatusJson("https://example.com", (value) => value, signal)
    ).resolves.toMatchObject({ ok: false });
  });
});
