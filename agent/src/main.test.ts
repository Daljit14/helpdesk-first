import { describe, expect, it } from "vitest";
import { parseArgs } from "./main";

describe("agent CLI", () => {
  it("parses supported options and rejects execution", () => {
    expect(
      parseArgs([
        "enroll",
        "--server",
        "https://example.test",
        "--token",
        "hd1_token",
      ])
    ).toEqual({
      command: "enroll",
      values: { server: "https://example.test", token: "hd1_token" },
    });
    expect(() => parseArgs(["run", "--exec", "whoami"])).toThrow(
      "execution is not supported"
    );
  });
});
