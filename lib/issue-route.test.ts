import { describe, expect, it } from "vitest";
import { parseIssueRoutePath } from "./issue-route";

describe("parseIssueRoutePath", () => {
  it.each([
    ["/issues/slow-computer", { slug: "slow-computer", guide: false }],
    ["/issues/slow-computer/guide?platform=mac", null],
    ["/issues/slow-computer/guide", { slug: "slow-computer", guide: true }],
    [
      "/issues/camera%2Dmic%2Dnot%2Dworking/guide/",
      { slug: "camera-mic-not-working", guide: true },
    ],
    ["/browse", null],
    ["/issues/slow-computer/extra", null],
  ])("parses %s", (pathname, expected) => {
    expect(parseIssueRoutePath(pathname)).toEqual(expected);
  });
});
