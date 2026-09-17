import { openSecret, sealSecret } from "@/lib/security/secret-box";
import { getMasterKeyId } from "@/lib/security/data-protection-config";

export interface KeyProvider {
  readonly id: string;
  readonly kekId: string;
  wrap(dek: Buffer): string;
  unwrap(wrapped: string): Buffer;
}

function masterKey(env: NodeJS.ProcessEnv): Buffer {
  const encoded = env.HELP_DESK_MASTER_KEY;
  if (!encoded) throw new Error("HELP_DESK_MASTER_KEY is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("HELP_DESK_MASTER_KEY must decode to 32 bytes");
  }
  return key;
}

export function createEnvKeyProvider(
  env: NodeJS.ProcessEnv = process.env
): KeyProvider {
  const key = masterKey(env);
  return {
    id: "env",
    kekId: getMasterKeyId(env),
    wrap(dek) {
      return sealSecret(dek.toString("base64"), key);
    },
    unwrap(wrapped) {
      return Buffer.from(openSecret(wrapped, key), "base64");
    },
  };
}
