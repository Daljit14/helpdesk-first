import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentExec } from "./collectors/index";
import { userSystemctl } from "./user-systemctl";

describe("userSystemctl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes root calls through the active graphical session user", async () => {
    vi.spyOn(process, "getuid").mockReturnValue(0);
    const calls: [string, string[]][] = [];
    const exec: AgentExec = async (file, args) => {
      calls.push([file, args]);
      return file === "loginctl" ? "3 1001 alice seat0 tty2\n" : "active";
    };

    await expect(
      userSystemctl(exec, ["is-active", "pipewire"], { timeoutMs: 30_000 })
    ).resolves.toBe("active");
    expect(calls).toEqual([
      ["loginctl", ["list-sessions", "--no-legend"]],
      [
        "runuser",
        [
          "-u",
          "alice",
          "--",
          "env",
          "XDG_RUNTIME_DIR=/run/user/1001",
          "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus",
          "systemctl",
          "--user",
          "is-active",
          "pipewire",
        ],
      ],
    ]);
  });

  it("keeps non-root calls on systemctl --user", async () => {
    vi.spyOn(process, "getuid").mockReturnValue(1000);
    const calls: [string, string[]][] = [];
    const exec: AgentExec = async (file, args) => {
      calls.push([file, args]);
      return "active";
    };

    await userSystemctl(exec, ["is-active", "pipewire"]);
    expect(calls).toEqual([["systemctl", ["--user", "is-active", "pipewire"]]]);
  });

  it("fails clearly when no graphical session is available", async () => {
    vi.spyOn(process, "getuid").mockReturnValue(0);
    const exec: AgentExec = async () => "";

    await expect(
      userSystemctl(exec, ["is-active", "pipewire"])
    ).rejects.toThrow("No active graphical session user found.");
  });
});
