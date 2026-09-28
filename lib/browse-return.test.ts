import { describe, expect, it } from "vitest";
import { buildBrowseReturnHref } from "./browse-return";

describe("buildBrowseReturnHref", () => {
  it("keeps only browse filters", () => {
    expect(buildBrowseReturnHref({ category: "network" })).toBe(
      "/browse?category=network"
    );
    expect(buildBrowseReturnHref({ platform: "Mac", q: "wifi" })).toBe(
      "/browse?q=wifi&platform=mac"
    );
    expect(buildBrowseReturnHref({ return: "/evil", next: "/x" })).toBe(
      "/browse"
    );
  });
});
