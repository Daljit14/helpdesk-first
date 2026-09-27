import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("agent release packaging", () => {
  it("places the bundle beside packaging scripts in the release archive", async () => {
    process.env.HELPDESK_AGENT_ROOT = process.cwd();
    const root = await mkdtemp(join(tmpdir(), "helpdesk-agent-package-"));
    const outputDirectory = join(root, "release");
    const packagingDirectory = join(root, "packaging");
    const bundlePath = join(root, "helpdesk-agent.js");
    await mkdir(packagingDirectory);
    await writeFile(bundlePath, "bundle");
    await writeFile(join(packagingDirectory, "install.sh"), "install");

    try {
      const { packageRelease } =
        await import("../../scripts/agent-package.mjs");
      const tarball = packageRelease({
        outputDirectory,
        bundlePath,
        packagingDirectory,
      });
      const { stdout: archive } = await execFileAsync("tar", ["-tzf", tarball]);
      expect(archive.split("\n")).toEqual(
        expect.arrayContaining(["helpdesk-agent.js", "packaging/install.sh"])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires a signature when verifying with a public key", async () => {
    const root = await mkdtemp(join(tmpdir(), "helpdesk-agent-verify-"));
    const payload = join(root, "payload.txt");
    const sums = join(root, "SHA256SUMS");
    const archive = join(root, "unsigned.tar.gz");
    await writeFile(payload, "payload");
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256").update("payload").digest("hex");
    await writeFile(sums, `${digest}  payload.txt\n`);

    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("tar", [
        "-czf",
        archive,
        "-C",
        root,
        "payload.txt",
        "SHA256SUMS",
      ]);
      const { verifyPackage } = await import("../../scripts/agent-package.mjs");
      expect(() =>
        verifyPackage(archive, Buffer.alloc(32).toString("base64"))
      ).toThrow("signature missing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
