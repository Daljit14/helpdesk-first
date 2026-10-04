import { Redis } from "@upstash/redis";
import type { ServiceHealthSnapshot } from "./types";

export const SERVICE_HEALTH_CACHE_TTL_SECONDS = 300;
const CACHE_PREFIX = "helpdesk-first:service-health:v1:";
const memoryCache = new Map<
  string,
  { expiresAt: number; value: ServiceHealthSnapshot }
>();
let redisClient: Redis | null = null;
let redisConfig = "";

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const config = `${url}\n${token}`;
  if (!redisClient || redisConfig !== config) {
    redisClient = new Redis({ url, token });
    redisConfig = config;
  }
  return redisClient;
}

function isSnapshot(value: unknown): value is ServiceHealthSnapshot {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as ServiceHealthSnapshot).incidents) &&
    Array.isArray((value as ServiceHealthSnapshot).sources) &&
    typeof (value as ServiceHealthSnapshot).checkedAt === "string"
  );
}

export function serviceHealthCacheKey(organizationId: string): string {
  return `${CACHE_PREFIX}${organizationId}`;
}

export async function getCachedSnapshot(
  organizationId: string
): Promise<ServiceHealthSnapshot | null> {
  const key = serviceHealthCacheKey(organizationId);
  try {
    const redis = getRedis();
    if (redis) {
      const value = await redis.get<ServiceHealthSnapshot | string>(key);
      const parsed =
        typeof value === "string" ? (JSON.parse(value) as unknown) : value;
      if (isSnapshot(parsed)) return parsed;
    }
  } catch {
    redisClient = null;
  }
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return cached.value;
}

export async function setCachedSnapshot(
  organizationId: string,
  snapshot: ServiceHealthSnapshot
): Promise<void> {
  const key = serviceHealthCacheKey(organizationId);
  memoryCache.set(key, {
    expiresAt: Date.now() + SERVICE_HEALTH_CACHE_TTL_SECONDS * 1000,
    value: snapshot,
  });
  try {
    const redis = getRedis();
    if (redis)
      await redis.set(key, JSON.stringify(snapshot), {
        ex: SERVICE_HEALTH_CACHE_TTL_SECONDS,
      });
  } catch {
    redisClient = null;
  }
}

export function clearServiceHealthMemoryCache() {
  memoryCache.clear();
}
