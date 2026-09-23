import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configDirectory } from "./store";

export type StoredSnapshot = Record<string, string | number | boolean | null>;

function snapshotPath(jobId: string): string {
  if (!/^[a-f0-9-]+$/i.test(jobId)) throw new Error("invalid_job_id");
  return join(configDirectory(), "snapshots", `${jobId}.json`);
}

function canonicalValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalValue(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`)
    .join(",")}}`;
}

export function canonicalJson(value: unknown): string {
  return canonicalValue(value);
}

export function snapshotHash(data: StoredSnapshot): string {
  return createHash("sha256").update(canonicalJson(data)).digest("hex");
}

export async function saveSnapshot(
  jobId: string,
  data: StoredSnapshot
): Promise<void> {
  const directory = join(configDirectory(), "snapshots");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = snapshotPath(jobId);
  await writeFile(path, `${canonicalJson(data)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function loadSnapshot(
  jobId: string
): Promise<StoredSnapshot | null> {
  try {
    return JSON.parse(
      await readFile(snapshotPath(jobId), "utf8")
    ) as StoredSnapshot;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return null;
    throw error;
  }
}

export async function deleteSnapshot(jobId: string): Promise<void> {
  await rm(snapshotPath(jobId), { force: true });
}
