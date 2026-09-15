import type { z } from "zod";
import type { StepRisk } from "@/lib/investigation/policy";

export const CAPABILITY_PLATFORMS = [
  "Windows",
  "macOS",
  "Linux",
  "iOS",
  "Android",
  "Other",
  "any",
] as const;
export type CapabilityPlatform = (typeof CAPABILITY_PLATFORMS)[number];

export const ADMIN_DEPARTMENTS = [
  "Operations Dashboard",
  "Ticket Queue",
  "AI Investigations",
  "Capability Matching",
  "Knowledge Base",
  "Organizations",
  "Users and Employees",
  "Attachments",
  "Notifications and SLA",
  "Analytics and Trust Center",
  "Security and Audit",
  "Integrations",
  "Settings",
] as const;
export type AdminDepartment = (typeof ADMIN_DEPARTMENTS)[number];

export type CapabilityConsent = "none" | "user" | "technician";
export type CapabilitySideEffects =
  "read_only" | "internal_write" | "external_write";
export type CapabilityRollback = "none" | "compensating" | `handler:${string}`;
export type CapabilityVersionStatus = "active" | "deprecated" | "revoked";

export type Precondition = {
  id: string;
  description: string;
};

export type CapabilityDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  id: string;
  version: number;
  platforms: CapabilityPlatform[];
  department: AdminDepartment;
  description: string;
  inputSchema: S;
  preconditions: Precondition[];
  riskLevel: StepRisk;
  consent: CapabilityConsent;
  orgPolicyRequirements: string[];
  maxRuntimeMs: number;
  expectedResult: string;
  verification: string;
  rollback: CapabilityRollback;
  owner: string;
  reviewDate: string;
  sideEffects: CapabilitySideEffects;
  estimatedCostCents?: number;
};

export const MIN_RUNTIME_MS = 1_000;
export const MAX_RUNTIME_MS = 600_000;
export const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
