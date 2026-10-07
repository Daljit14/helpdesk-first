import { afterEach, describe, expect, test, vi } from "vitest";
import { createBraveProvider } from "@/lib/research/providers/brave";
import { createTavilyProvider } from "@/lib/research/providers/tavily";
import {
  clearStackExchangeBackoff,
  createStackExchangeProvider,
} from "./providers/stackexchange";
import { createWikipediaProvider } from "./providers/wikipedia";
import { answerSourceFromResearch, searchWithFailover } from "./providers/web";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearStackExchangeBackoff();
});

describe("answer providers", () => {
  test("bounds mapped web-source text and rejects malformed provider responses", async () => {
    const mapped = answerSourceFromResearch("brave", {
      url: "https://support.microsoft.com/help",
      domain: "support.microsoft.com",
      title: "Help",
      snippet: "x".repeat(7000),
      trust: "vendor",
      contentHash: "hash",
      fetchedAt: "2026-10-07T00:00:00.000Z",
    });
    expect(mapped.text).toHaveLength(6000);

    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ web: { results: [{ url: "not a URL" }] } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createBraveProvider("fake-key", {
      maxAttempts: 1,
    }).search("outlook issue", new AbortController().signal);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid_response" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("parses Brave and Tavily sources with bounded request settings", async () => {
    const braveFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  url: "https://support.microsoft.com/help",
                  title: "Help",
                  description: "A safe support snippet.",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", braveFetch);
    const brave = await createBraveProvider("fake-key", {
      timeoutMs: 321,
      maxAttempts: 1,
    }).search("outlook issue", new AbortController().signal);
    expect(brave.ok).toBe(true);
    if (brave.ok)
      expect(brave.value[0].url).toBe("https://support.microsoft.com/help");
    expect(braveFetch).toHaveBeenCalledTimes(1);

    const tavilyFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                url: "https://learn.microsoft.com/help",
                title: "Learn",
                content: "A safe result snippet.",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", tavilyFetch);
    const tavily = await createTavilyProvider("fake-key", {
      timeoutMs: 456,
      maxAttempts: 1,
    }).search("outlook issue", new AbortController().signal);
    expect(tavily.ok).toBe(true);
    if (tavily.ok) expect(tavily.value[0].domain).toBe("learn.microsoft.com");
    expect(tavilyFetch).toHaveBeenCalledTimes(1);
  });

  test("uses MediaWiki search parameters, a contact User-Agent, and attribution", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            query: {
              pages: [
                {
                  title: "Software",
                  fullurl: "https://en.wikipedia.org/wiki/Software",
                  extract: "Plain text extract.",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const sources = await createWikipediaProvider({
      contact: "https://example.test/contact",
      timeoutMs: 765,
    }).search("software help", new AbortController().signal);
    expect(sources[0]).toMatchObject({
      provider: "wikipedia",
      attribution: "Wikipedia contributors, CC BY-SA 4.0",
    });
    const [rawUrl, init] = fetchMock.mock.calls[0];
    const url = new URL(String(rawUrl));
    expect(url.searchParams.get("generator")).toBe("search");
    expect(url.searchParams.get("gsrsearch")).toBe("software help");
    expect(url.searchParams.get("explaintext")).toBe("1");
    expect(url.searchParams.has("explainText")).toBe(false);
    expect((init?.headers as Record<string, string>)["user-agent"]).toContain(
      "https://example.test/contact"
    );
    expect(timeoutSpy).toHaveBeenCalledWith(765);
  });

  test("skips Stack Exchange without a key and fetches only accepted answer bodies with attribution", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await createStackExchangeProvider({
        apiKey: "",
        sites: ["superuser"],
      }).search("wifi help", new AbortController().signal)
    ).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              question_id: 10,
              accepted_answer_id: 33,
              title: "Wi-Fi help",
              link: "https://superuser.com/questions/10",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              answer_id: 33,
              question_id: 10,
              body: "<p>Restart the adapter &amp; reconnect.</p>",
              link: "https://superuser.com/a/33",
              owner: { display_name: "Helper" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const sources = await createStackExchangeProvider({
      apiKey: "fake-key",
      sites: ["superuser"],
    }).search("wifi help", new AbortController().signal);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      provider: "stackexchange",
      text: "Restart the adapter & reconnect.",
      attribution: expect.stringContaining("Helper on Super User"),
    });
    const searchUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const answersUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(searchUrl.pathname).toBe("/2.3/search/advanced");
    expect(searchUrl.searchParams.get("accepted")).toBe("true");
    expect(searchUrl.searchParams.get("site")).toBe("superuser");
    expect(searchUrl.searchParams.get("key")).toBe("fake-key");
    expect(answersUrl.pathname).toBe("/2.3/answers/33");
    expect(answersUrl.searchParams.get("filter")).toBe("withbody");
    expect(answersUrl.searchParams.get("key")).toBe("fake-key");
  });

  test("honors Stack Exchange backoff and provider failover order", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [], backoff: 30 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = createStackExchangeProvider({
      apiKey: "fake-key",
      sites: ["serverfault"],
      now: () => 1000,
    });
    await provider.search("server issue", new AbortController().signal);
    await provider.search("server issue", new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const order: string[] = [];
    const result = await searchWithFailover(
      [
        {
          id: "brave",
          async search() {
            order.push("brave");
            return {
              ok: false,
              error: { kind: "unavailable", message: "offline" },
            };
          },
        },
        {
          id: "tavily",
          async search() {
            order.push("tavily");
            return { ok: true, value: [] };
          },
        },
      ],
      "query",
      new AbortController().signal
    );
    expect(order).toEqual(["brave", "tavily"]);
    expect(result?.provider.id).toBe("tavily");
  });
});
