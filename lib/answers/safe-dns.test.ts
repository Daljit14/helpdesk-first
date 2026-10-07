import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import https from "node:https";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  isPrivateAddress,
  pinnedFetch,
  pinnedLookup,
  resolvePublicHost,
  type HostResolver,
} from "./safe-dns";

vi.mock("node:https", () => ({
  default: { request: vi.fn() },
}));

const privateAddresses = [
  "0.0.0.0",
  "0.255.255.255",
  "10.0.0.1",
  "100.64.0.1",
  "100.127.255.255",
  "127.0.0.1",
  "169.254.0.1",
  "172.16.0.1",
  "172.31.255.255",
  "192.0.0.1",
  "192.0.2.1",
  "192.88.99.1",
  "192.168.0.1",
  "198.18.0.1",
  "198.19.255.255",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "239.255.255.255",
  "240.0.0.1",
  "255.255.255.255",
  "::",
  "::1",
  "::2",
  "fc00::1",
  "fdff:ffff::1",
  "fe80::1",
  "fe80::1%eth0",
  "febf::1",
  "fec0::1",
  "ff00::1",
  "2001:db8::1",
  "100::1",
  "::ffff:127.0.0.1",
  "::ffff:7f00:1",
  "::FFFF:10.0.0.1",
  "64:ff9b::a00:1",
  "2002:0a00:0001::",
  "not-an-address",
];

const publicAddresses = [
  "1.0.0.1",
  "9.255.255.255",
  "100.63.255.255",
  "100.128.0.1",
  "128.0.0.1",
  "169.253.255.255",
  "172.15.0.1",
  "172.32.0.1",
  "192.0.1.1",
  "192.0.3.1",
  "192.88.98.1",
  "192.88.100.1",
  "192.167.255.255",
  "198.17.255.255",
  "198.20.0.1",
  "198.51.99.1",
  "203.0.112.1",
  "223.255.255.255",
  "2606:4700:4700::1111",
  "2001:db9::1",
  "100:0:0:1::1",
];

describe("safe DNS", () => {
  test.each(privateAddresses)("treats %s as private", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  test.each(publicAddresses)("treats %s as public", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  test("fails closed for private, empty, and failed DNS answers", async () => {
    const signal = new AbortController().signal;
    const resolvers: Array<[HostResolver, string]> = [
      [async () => [{ address: "127.0.0.1", family: 4 }], "private_network"],
      [async () => [], "dns_failed"],
      [
        async () => {
          throw new Error("dns failed");
        },
        "dns_failed",
      ],
    ];
    for (const [resolver, reason] of resolvers) {
      await expect(
        resolvePublicHost("example.test", signal, resolver)
      ).resolves.toEqual({ ok: false, reason });
    }
  });

  test("returns the first validated public address", async () => {
    await expect(
      resolvePublicHost(
        "example.test",
        new AbortController().signal,
        async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "2606:4700:4700::1111", family: 6 },
        ]
      )
    ).resolves.toEqual({
      ok: true,
      address: { address: "8.8.8.8", family: 4 },
    });
  });

  test("times out DNS resolution after two seconds", async () => {
    vi.useFakeTimers();
    try {
      const pending = resolvePublicHost(
        "example.test",
        new AbortController().signal,
        async () => new Promise(() => {})
      );
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toEqual({
        ok: false,
        reason: "dns_failed",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("pinned lookup supports both Node callback shapes", () => {
    const lookup = pinnedLookup({ address: "8.8.4.4", family: 4 });
    const allCallback = vi.fn();
    const singleCallback = vi.fn();
    lookup("example.test", { all: true }, allCallback);
    lookup("example.test", {}, singleCallback);
    expect(allCallback).toHaveBeenCalledWith(null, [
      { address: "8.8.4.4", family: 4 },
    ]);
    expect(singleCallback).toHaveBeenCalledWith(null, "8.8.4.4", 4);
  });

  describe("pinned HTTPS fetch", () => {
    beforeEach(() => {
      vi.mocked(https.request).mockReset();
    });

    test("pins the connection while preserving hostname SNI and Host", async () => {
      vi.mocked(https.request).mockImplementation(((
        options: Record<string, unknown>,
        callback?: (response: unknown) => void
      ) => {
        const response = new PassThrough();
        const request = Object.assign(new EventEmitter(), { end: vi.fn() });
        Object.assign(response, {
          statusCode: 200,
          statusMessage: "OK",
          headers: { "x-multi": ["one", "two"] },
        });
        response.end("page");
        callback?.(response);
        return request;
      }) as unknown as typeof https.request);
      const pinned = { address: "93.184.216.34", family: 4 as const };
      const response = await pinnedFetch(
        new URL("https://docs.example.test/article?q=1"),
        { method: "GET" },
        pinned
      );
      expect(await response.text()).toBe("page");
      expect(response.headers.get("x-multi")).toBe("one, two");

      const [options] = vi.mocked(https.request).mock.calls[0] as unknown as [
        Record<string, unknown>,
      ];
      expect(options).toMatchObject({
        host: "docs.example.test",
        servername: "docs.example.test",
        port: 443,
        path: "/article?q=1",
        method: "GET",
        headers: { host: "docs.example.test" },
        agent: false,
      });
      const lookup = options.lookup as ReturnType<typeof pinnedLookup>;
      const callback = vi.fn();
      lookup("docs.example.test", {}, callback);
      expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    });

    test("rejects invalid response statuses without throwing synchronously", async () => {
      const response = new PassThrough();
      Object.assign(response, {
        statusCode: 999,
        statusMessage: "Invalid",
        headers: {},
      });
      const destroy = vi.spyOn(response, "destroy");
      vi.mocked(https.request).mockImplementation(((
        _options: Record<string, unknown>,
        callback?: (response: unknown) => void
      ) => {
        const request = Object.assign(new EventEmitter(), { end: vi.fn() });
        callback?.(response);
        return request;
      }) as unknown as typeof https.request);

      let fetchPromise!: Promise<Response>;
      expect(() => {
        fetchPromise = pinnedFetch(
          new URL("https://docs.example.test/article"),
          {},
          { address: "93.184.216.34", family: 4 }
        );
      }).not.toThrow();
      await expect(fetchPromise).rejects.toThrow(RangeError);
      expect(destroy).toHaveBeenCalled();
    });

    test("rejects non-HTTPS URLs", () => {
      expect(() =>
        pinnedFetch(
          new URL("http://docs.example.test/article"),
          {},
          { address: "93.184.216.34", family: 4 }
        )
      ).toThrow("pinned fetch requires an https URL");
    });
  });
});
