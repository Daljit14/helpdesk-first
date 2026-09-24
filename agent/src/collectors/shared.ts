import { lookup } from "node:dns/promises";
import { readdir, readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { record, type Collector } from "./index";

export function dnsCollector(serverHost?: string): Collector {
  return {
    kind: "dns_resolution",
    run: async () => {
      const hosts = [
        "www.microsoft.com",
        "www.google.com",
        ...(serverHost ? [serverHost] : []),
      ];
      let resolved = 0;
      for (const host of hosts) {
        try {
          await lookup(host);
          resolved += 1;
        } catch {
          // Count failures without exposing hostnames or resolver details.
        }
      }
      const failed = hosts.length - resolved;
      return record("dns_resolution", { resolved, failed }, failed === 0);
    },
  };
}

async function extensionNames(
  root: string,
  names: string[],
  depth = 0
): Promise<void> {
  if (names.length >= 40) return;
  if (depth > 6) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (names.length >= 40) return;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await extensionNames(path, names, depth + 1);
      continue;
    }
    if (entry.name !== "manifest.json") continue;
    try {
      const value: unknown = JSON.parse(await readFile(path, "utf8"));
      if (
        value &&
        typeof value === "object" &&
        "name" in value &&
        typeof value.name === "string" &&
        value.name.length > 0
      ) {
        names.push(value.name.slice(0, 128));
      }
    } catch {
      // Ignore malformed or inaccessible manifests.
    }
  }
}

export function browserExtensionsCollector(): Collector {
  return {
    kind: "browser_extensions",
    run: async () => {
      const home = homedir();
      const roots =
        platform() === "win32"
          ? [
              join(
                process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"),
                "Google",
                "Chrome",
                "User Data"
              ),
              join(
                process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"),
                "Microsoft",
                "Edge",
                "User Data"
              ),
            ]
          : platform() === "darwin"
            ? [
                join(
                  home,
                  "Library",
                  "Application Support",
                  "Google",
                  "Chrome"
                ),
                join(home, "Library", "Application Support", "Microsoft Edge"),
              ]
            : [
                join(home, ".config", "google-chrome"),
                join(home, ".config", "microsoft-edge"),
              ];
      const names: string[] = [];
      for (const root of roots) await extensionNames(root, names);
      return record("browser_extensions", {
        count: names.length,
        names: names.slice(0, 40).map((name) => name.slice(0, 80)),
      });
    },
  };
}
