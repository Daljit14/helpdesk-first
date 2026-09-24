import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const releaseDir = join(root, "agent", "release");
const version = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8")
).version;

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function packageRelease() {
  execFileSync("mkdir", ["-p", releaseDir]);
  const staging = mkdtempSync(join(tmpdir(), "helpdesk-agent-"));
  execFileSync("cp", [
    join(root, "agent", "dist", "helpdesk-agent.js"),
    staging,
  ]);
  execFileSync("cp", ["-R", join(root, "agent", "packaging"), staging]);
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(relative(staging, path));
    }
  };
  walk(staging);
  const sums = files
    .sort()
    .map((file) => `${sha256(join(staging, file))}  ${file}`)
    .join("\n");
  writeFileSync(join(staging, "SHA256SUMS"), `${sums}\n`);
  const key = process.env.HELP_DESK_AGENT_SIGNING_KEY;
  if (key) {
    const seed = Buffer.from(key, "base64");
    if (seed.length !== 32)
      throw new Error("signing key must be a 32-byte Ed25519 seed");
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        seed,
      ]),
      format: "der",
      type: "pkcs8",
    });
    writeFileSync(
      join(staging, "SHA256SUMS.sig"),
      sign(null, Buffer.from(sums), privateKey)
    );
  }
  const tarball = join(releaseDir, `helpdesk-agent-${version}.tar.gz`);
  execFileSync("tar", [
    "-czf",
    tarball,
    "-C",
    staging,
    ...readdirSync(staging),
  ]);
  rmSync(staging, { recursive: true, force: true });
  console.log(tarball);
}

function verifyPackage(tarball, publicKey) {
  const staging = mkdtempSync(join(tmpdir(), "helpdesk-agent-verify-"));
  execFileSync("tar", ["-xzf", tarball, "-C", staging]);
  const sums = readFileSync(join(staging, "SHA256SUMS"), "utf8");
  for (const line of sums.trim().split("\n")) {
    const [, expected, file] = line.match(/^([a-f0-9]{64})  (.+)$/) ?? [];
    if (!expected || !file || sha256(join(staging, file)) !== expected)
      throw new Error(`checksum mismatch: ${file ?? "invalid entry"}`);
  }
  const signature = join(staging, "SHA256SUMS.sig");
  if (publicKey && readdirSync(staging).includes("SHA256SUMS.sig")) {
    const raw = Buffer.from(publicKey, "base64");
    const key =
      raw.length === 32
        ? createPublicKey({
            key: Buffer.concat([
              Buffer.from("302a300506032b6570032100", "hex"),
              raw,
            ]),
            format: "der",
            type: "spki",
          })
        : createPublicKey(publicKey);
    if (!verify(null, Buffer.from(sums), key, readFileSync(signature)))
      throw new Error("signature verification failed");
  }
  rmSync(staging, { recursive: true, force: true });
  console.log("package verified");
}

if (process.argv[2] === "verify")
  verifyPackage(process.argv[3], process.argv[4]);
else packageRelease();
