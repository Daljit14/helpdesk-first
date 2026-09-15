import { createHash } from "node:crypto";
import { z } from "zod";
import { CAPABILITY_DEFINITIONS } from "./definitions";
import { findProhibited } from "./prohibited";
import {
  ADMIN_DEPARTMENTS,
  CAPABILITY_ID_PATTERN,
  CAPABILITY_PLATFORMS,
  MAX_RUNTIME_MS,
  MIN_RUNTIME_MS,
  type CapabilityDefinition,
} from "./types";

const APPROVED_RISKS = new Set(["safe", "caution", "approval"]);
const CONSENTS = new Set(["none", "user", "technician"]);
const SIDE_EFFECTS = new Set(["read_only", "internal_write", "external_write"]);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function inputSchemaJson(def: CapabilityDefinition): unknown {
  return z.toJSONSchema(def.inputSchema, { io: "input" });
}

function isStrictObject(schema: z.ZodTypeAny): boolean {
  if (!(schema instanceof z.ZodObject)) return false;
  const json = z.toJSONSchema(schema, { io: "input" }) as {
    additionalProperties?: unknown;
  };
  return json.additionalProperties === false;
}

export function capabilityChecksum(def: CapabilityDefinition): string {
  const body = canonical({
    id: def.id,
    version: def.version,
    platforms: [...def.platforms].sort(),
    department: def.department,
    description: def.description,
    inputSchema: inputSchemaJson(def),
    preconditions: def.preconditions,
    riskLevel: def.riskLevel,
    consent: def.consent,
    orgPolicyRequirements: [...def.orgPolicyRequirements].sort(),
    maxRuntimeMs: def.maxRuntimeMs,
    expectedResult: def.expectedResult,
    verification: def.verification,
    rollback: def.rollback,
    sideEffects: def.sideEffects,
  });
  return createHash("sha256").update(body).digest("hex");
}

export function validateRegistry(
  defs: readonly CapabilityDefinition[],
  now: Date = new Date()
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const today = now.toISOString().slice(0, 10);
  for (const def of defs) {
    const tag = `${def.id}@${def.version}`;
    const key = `${def.id}:${def.version}`;
    if (seen.has(key)) errors.push(`${tag}: duplicate id/version`);
    seen.add(key);
    if (!CAPABILITY_ID_PATTERN.test(def.id))
      errors.push(`${tag}: invalid id (snake_case, 3-64 chars)`);
    if (!Number.isInteger(def.version) || def.version < 1)
      errors.push(`${tag}: version must be a positive integer`);
    if (!def.description || def.description.length > 500)
      errors.push(`${tag}: description must be 1-500 chars`);
    const prohibited = findProhibited(`${def.id} ${def.description}`);
    if (prohibited) errors.push(`${tag}: prohibited action (${prohibited})`);
    if (!APPROVED_RISKS.has(def.riskLevel))
      errors.push(`${tag}: riskLevel "${def.riskLevel}" cannot be registered`);
    if (!CONSENTS.has(def.consent))
      errors.push(`${tag}: invalid consent "${def.consent}"`);
    if (!SIDE_EFFECTS.has(def.sideEffects))
      errors.push(`${tag}: invalid sideEffects "${def.sideEffects}"`);
    if (!ADMIN_DEPARTMENTS.includes(def.department))
      errors.push(`${tag}: unknown department "${def.department}"`);
    if (
      def.platforms.length === 0 ||
      def.platforms.some((p) => !CAPABILITY_PLATFORMS.includes(p))
    )
      errors.push(`${tag}: invalid platforms`);
    if (
      !Number.isInteger(def.maxRuntimeMs) ||
      def.maxRuntimeMs < MIN_RUNTIME_MS ||
      def.maxRuntimeMs > MAX_RUNTIME_MS
    )
      errors.push(`${tag}: maxRuntimeMs out of bounds`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(def.reviewDate) || def.reviewDate < today)
      errors.push(`${tag}: reviewDate must be a future ISO date`);
    if (!def.owner) errors.push(`${tag}: owner required`);
    if (!def.expectedResult || !def.verification)
      errors.push(`${tag}: expectedResult and verification required`);
    if (
      def.rollback !== "none" &&
      def.rollback !== "compensating" &&
      !def.rollback.startsWith("handler:")
    )
      errors.push(`${tag}: invalid rollback "${def.rollback}"`);
    if (!isStrictObject(def.inputSchema))
      errors.push(`${tag}: inputSchema must be a strict (closed) object`);
    const ids = new Set<string>();
    for (const p of def.preconditions) {
      if (!p.id || !p.description || ids.has(p.id))
        errors.push(`${tag}: invalid or duplicate precondition "${p.id}"`);
      ids.add(p.id);
    }
  }
  return errors;
}

const initErrors = validateRegistry(CAPABILITY_DEFINITIONS);
if (initErrors.length > 0) {
  throw new Error(`Capability registry invalid:\n${initErrors.join("\n")}`);
}

export const CAPABILITIES: readonly CapabilityDefinition[] =
  CAPABILITY_DEFINITIONS;

export function listCapabilities(): CapabilityDefinition[] {
  return [...CAPABILITIES];
}

export function getCapability(
  id: string,
  version: number
): CapabilityDefinition | null {
  return CAPABILITIES.find((c) => c.id === id && c.version === version) ?? null;
}

export function capabilityStatus(
  capability: CapabilityDefinition | null,
  now = new Date()
): "active" | "expired" | "unknown" {
  if (!capability) return "unknown";
  const review = new Date(`${capability.reviewDate}T23:59:59.999Z`);
  return review.getTime() < now.getTime() ? "expired" : "active";
}

export function validateCapabilityInput(
  id: string,
  version: number,
  input: unknown
): { ok: true; value: unknown } | { ok: false; issues: string[] } {
  const def = getCapability(id, version);
  if (!def) return { ok: false, issues: ["unknown capability"] };
  const parsed = def.inputSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map(
      (i) => `${i.path.map(String).join(".") || "$"}: ${i.message}`
    ),
  };
}

export function capabilityEnvFlag(id: string): string {
  return `HELP_DESK_CAP_${id.toUpperCase()}_ENABLED`;
}
