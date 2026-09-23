import { lstat, readdir, stat, unlink } from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import { join } from "node:path";
import type { DevicePlatform } from "../../../lib/device-agent/protocol";
import type { Executor, SnapshotData } from ".";
import { runDiagnostic } from "./shared";

const MAX_FILES = 5_000;
const MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Candidate = {
  path: string;
  size: number;
};

async function rootStats(path: string): Promise<Stats | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function candidatesIn(
  root: string,
  now: number,
  candidates: Candidate[]
): Promise<void> {
  const rootInfo = await rootStats(root);
  if (!rootInfo?.isDirectory()) return;
  const pending = [root];
  while (pending.length && candidates.length < MAX_FILES) {
    const directory = pending.pop();
    if (!directory) break;
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (candidates.length >= MAX_FILES) return;
      const path = join(directory, entry.name);
      let info: Stats;
      try {
        info = await lstat(path);
      } catch {
        continue;
      }
      if (info.dev !== rootInfo.dev || info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (info.isFile() && now - info.mtimeMs > MIN_AGE_MS)
        candidates.push({ path, size: info.size });
    }
  }
}

async function findCandidates(
  roots: readonly string[],
  now = Date.now()
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (const root of roots) {
    if (candidates.length >= MAX_FILES) break;
    await candidatesIn(root, now, candidates);
  }
  return candidates;
}

export function cleanupExecutor(
  platform: DevicePlatform,
  roots: () => readonly string[]
): Executor {
  return {
    actionId: "device_cleanup_temp_files",
    platform,
    snapshot: async (exec) => {
      const files = await findCandidates(roots());
      const disk = await runDiagnostic(platform, "disk_space", exec);
      const freePercent = disk.data.freePercent;
      return {
        files: files.length,
        bytes: files.reduce((total, file) => total + file.size, 0),
        freePercentBefore: typeof freePercent === "number" ? freePercent : 0,
      };
    },
    apply: async (_exec, _params, _snapshot) => {
      const candidates = await findCandidates(roots());
      let deleted = 0;
      let skipped = 0;
      for (const file of candidates) {
        try {
          await unlink(file.path);
          deleted += 1;
        } catch {
          skipped += 1;
        }
      }
      if (
        candidates.length > 0 &&
        deleted === 0 &&
        skipped === candidates.length
      )
        throw new Error("cleanup_failed");
    },
    verify: async (exec, _params, before: SnapshotData) => {
      const disk = await runDiagnostic(platform, "disk_space", exec);
      const freePercent = disk.data.freePercent;
      const beforePercent =
        typeof before.freePercentBefore === "number"
          ? before.freePercentBefore
          : 0;
      const ok =
        disk.ok &&
        typeof freePercent === "number" &&
        freePercent >= beforePercent;
      return {
        ok,
        summary: ok
          ? "Temporary-file cleanup preserved or increased free space."
          : "Free space did not meet the pre-cleanup level.",
      };
    },
  };
}
