import { afterEach, describe, expect, test, vi } from "vitest";
import { NoScanner, VirusTotalScanner } from "./scanner";

afterEach(() => vi.restoreAllMocks());

const meta = { sha256: "abc", mime: "image/png" };

describe("attachment scanners", () => {
  test("NoScanner records unscanned", async () => {
    await expect(
      new NoScanner().scan(new Uint8Array([1]), meta)
    ).resolves.toEqual({
      verdict: "unscanned",
      engine: "none",
    });
  });

  test("uses a cached clean VirusTotal result", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              attributes: {
                last_analysis_stats: { malicious: 0, suspicious: 0 },
              },
            },
          }),
          { status: 200 }
        )
    );
    await expect(
      new VirusTotalScanner("key", fetchImpl as never).scan(
        new Uint8Array([1]),
        meta
      )
    ).resolves.toMatchObject({ verdict: "clean", engine: "virustotal" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("maps malicious and suspicious results", async () => {
    const malicious = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { attributes: { last_analysis_stats: { malicious: 1 } } },
          }),
          { status: 200 }
        )
    );
    await expect(
      new VirusTotalScanner("key", malicious as never).scan(
        new Uint8Array([1]),
        meta
      )
    ).resolves.toMatchObject({ verdict: "infected" });
    const suspicious = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { attributes: { last_analysis_stats: { suspicious: 1 } } },
          }),
          { status: 200 }
        )
    );
    await expect(
      new VirusTotalScanner("key", suspicious as never).scan(
        new Uint8Array([1]),
        meta
      )
    ).resolves.toMatchObject({ verdict: "suspicious" });
  });

  test("uploads after a cache miss and polls the analysis", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { links: { self: "https://analysis" } } }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { attributes: { last_analysis_stats: { malicious: 0 } } },
          }),
          { status: 200 }
        )
      );
    await expect(
      new VirusTotalScanner("key", fetchImpl as never).scan(
        new Uint8Array([1]),
        meta
      )
    ).resolves.toMatchObject({ verdict: "clean" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("converts scanner failures to error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      new VirusTotalScanner("key", fetchImpl as never).scan(
        new Uint8Array([1]),
        meta
      )
    ).resolves.toMatchObject({ verdict: "error" });
  });
});
