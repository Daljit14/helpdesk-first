import { describe, expect, it } from "vitest";
import { linuxCollectors } from "./collectors/linux";

describe("collectors", () => {
  it("uses injected execution and bounds failures", async () => {
    const collector = linuxCollectors.find(
      (item) => item.kind === "dns_resolution"
    );
    expect(collector).toBeDefined();
    const success = await collector!.run(async (file, args) => {
      expect(file).toBe("resolvectl");
      expect(args).toEqual(["status"]);
      return "dns status";
    });
    expect(success.ok).toBe(true);
    const failure = await collector!.run(async () => {
      throw new Error("secret command output");
    });
    expect(failure.ok).toBe(false);
    expect(failure.summary).toBe("Diagnostic unavailable.");
    expect(failure.error).toBe("secret command output");
  });
});
