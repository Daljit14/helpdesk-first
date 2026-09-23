import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { main, parseArgs } from "./main";
import { vi } from "vitest";

const { updateAgentState } = vi.hoisted(() => ({
  updateAgentState: vi.fn(),
}));
vi.mock("./store", async () => ({
  ...(await vi.importActual<typeof import("./store")>("./store")),
  updateAgentState,
}));

const execFileAsync = promisify(execFile);

afterEach(async () => {
  await rm(resolve("agent/dist"), { recursive: true, force: true });
});

describe("agent CLI", () => {
  it("parses supported options without treating --exec specially", () => {
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
    expect(parseArgs(["run", "--exec", "whoami"])).toEqual({
      command: "run",
      values: { exec: "whoami" },
    });
  });

  it.each([
    ["enable-execution", true, "execution enabled\n"],
    ["disable-execution", false, "execution disabled\n"],
  ])("%s updates local execution opt-in", async (command, value, output) => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    await main([command]);
    expect(updateAgentState).toHaveBeenCalledWith({
      executionOptIn: value,
    });
    expect(write).toHaveBeenCalledWith(output);
    write.mockRestore();
  });

  it("runs the bundled version command and redacts command failures", async () => {
    await execFileAsync("npm", ["run", "agent:build"], {
      cwd: process.cwd(),
    });
    const bundlePath = resolve("agent/dist/helpdesk-agent.js");

    const version = await execFileAsync(process.execPath, [
      bundlePath,
      "version",
    ]);
    expect(version.stdout).toContain("helpdesk-agent 1.1.0");

    const failure = await execFileAsync(process.execPath, [
      bundlePath,
      "unknown",
    ]).then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).toBeTruthy();
    if (failure && typeof failure === "object" && "stderr" in failure) {
      expect(failure.stderr).toBe("helpdesk-agent command failed\n");
    }
  });
});
