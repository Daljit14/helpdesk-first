import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEnvKeyProvider } from "@/lib/security/key-provider";

type Admin = ReturnType<typeof createAdminClient>;

export interface OrgKey {
  organizationId: string;
  keyVersion: number;
  dek: Buffer;
}

type CachedKey = { key: OrgKey; expiresAt: number };
const cache = new Map<string, CachedKey>();
const CACHE_TTL_MS = 5 * 60_000;

function cacheKey(organizationId: string, keyVersion: number): string {
  return `${organizationId}:${keyVersion}`;
}

function rowKey(
  organizationId: string,
  row: { key_version: number; wrapped_dek: string }
): OrgKey {
  const key = createEnvKeyProvider().unwrap(row.wrapped_dek);
  if (key.length !== 32) throw new Error("Invalid organization DEK");
  return { organizationId, keyVersion: row.key_version, dek: key };
}

function readCached(key: string): OrgKey | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.key;
}

function store(key: OrgKey): OrgKey {
  cache.set(cacheKey(key.organizationId, key.keyVersion), {
    key,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return key;
}

export async function getActiveOrgKey(
  admin: Admin,
  organizationId: string
): Promise<OrgKey> {
  const active = await admin
    .from("organization_keys")
    .select("key_version,wrapped_dek")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (active.error) throw active.error;
  if (active.data) {
    return (
      readCached(cacheKey(organizationId, active.data.key_version)) ??
      store(rowKey(organizationId, active.data))
    );
  }

  const provider = createEnvKeyProvider();
  const inserted = await admin.from("organization_keys").insert({
    organization_id: organizationId,
    key_version: 1,
    kek_id: provider.kekId,
    wrapped_dek: provider.wrap(randomBytes(32)),
    status: "active",
  });
  if (inserted.error && inserted.error.code !== "23505") {
    throw inserted.error;
  }
  const reread = await admin
    .from("organization_keys")
    .select("key_version,wrapped_dek")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (reread.error || !reread.data) {
    throw reread.error ?? new Error("Organization key was not created");
  }
  return (
    readCached(cacheKey(organizationId, reread.data.key_version)) ??
    store(rowKey(organizationId, reread.data))
  );
}

export async function getOrgKeyVersion(
  admin: Admin,
  organizationId: string,
  keyVersion: number
): Promise<OrgKey> {
  const cached = readCached(cacheKey(organizationId, keyVersion));
  if (cached) return cached;
  const result = await admin
    .from("organization_keys")
    .select("key_version,wrapped_dek")
    .eq("organization_id", organizationId)
    .eq("key_version", keyVersion)
    .maybeSingle();
  if (result.error || !result.data) {
    throw result.error ?? new Error("Organization key was not found");
  }
  return store(rowKey(organizationId, result.data));
}

export async function rotateOrgKey(
  admin: Admin,
  organizationId: string
): Promise<OrgKey> {
  const current = await getActiveOrgKey(admin, organizationId);
  const provider = createEnvKeyProvider();
  const nextVersion = current.keyVersion + 1;
  const retired = await admin
    .from("organization_keys")
    .update({ status: "retired", retired_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("key_version", current.keyVersion)
    .eq("status", "active");
  if (retired.error) throw retired.error;
  const inserted = await admin
    .from("organization_keys")
    .insert({
      organization_id: organizationId,
      key_version: nextVersion,
      kek_id: provider.kekId,
      wrapped_dek: provider.wrap(randomBytes(32)),
      status: "active",
    })
    .select("key_version,wrapped_dek")
    .single();
  if (inserted.error || !inserted.data) {
    const restored = await admin
      .from("organization_keys")
      .update({ status: "active", retired_at: null })
      .eq("organization_id", organizationId)
      .eq("key_version", current.keyVersion)
      .eq("status", "retired");
    if (restored.error) throw restored.error;
    throw inserted.error ?? new Error("Organization key was not created");
  }
  return store(rowKey(organizationId, inserted.data));
}

export function clearOrgKeyCacheForTests(): void {
  cache.clear();
}
