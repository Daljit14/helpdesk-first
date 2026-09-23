import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const paths = vi.hoisted(() => ({ directory: "" }));
vi.mock("./store", () => ({
  configDirectory: () => paths.directory,
}));

import {
  canonicalJson,
  loadSnapshot,
  saveSnapshot,
  snapshotHash,
} from "./snapshots";

afterEach(() => {
  paths.directory = "";
});

describe("agent snapshots", () => {
  it("hashes equivalent key orders identically", () => {
    expect(snapshotHash({ b: 2, a: "one" })).toBe(
      snapshotHash({ a: "one", b: 2 })
    );
    expect(canonicalJson({ b: 2, a: "one" })).toBe('{"a":"one","b":2}');
  });

  it.skipIf(process.platform === "win32")(
    "writes private snapshot files",
    async () => {
      paths.directory = await mkdtemp(join(tmpdir(), "helpdesk-snapshot-"));
      const data = { adapterName: "eth0", connected: true };
      await saveSnapshot("00000000-0000-0000-0000-000000000001", data);
      const path = join(
        paths.directory,
        "snapshots",
        "00000000-0000-0000-0000-000000000001.json"
      );
      expect(
        await loadSnapshot("00000000-0000-0000-0000-000000000001")
      ).toEqual(data);
      expect(
        (await stat(join(paths.directory, "snapshots"))).mode & 0o777
      ).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(await readFile(path, "utf8")).toContain('"adapterName":"eth0"');
    }
  );
});
