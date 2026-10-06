import type { User } from "@supabase/supabase-js";
import { computeAssurance, type AssuranceFacts } from "./assurance";
import { loadIdpMfaAttestation } from "@/lib/org-environment/profile";

export async function computeWebAssurance(input: {
  admin: Parameters<typeof loadIdpMfaAttestation>[0];
  organizationId: string;
  user: User;
  claims: Record<string, unknown> | null;
  freshMinutes: number;
  now?: Date;
}): Promise<AssuranceFacts> {
  const attestation = await loadIdpMfaAttestation(
    input.admin,
    input.organizationId
  );
  const aal =
    input.claims?.aal === "aal1" || input.claims?.aal === "aal2"
      ? input.claims.aal
      : null;
  const appMetadata = input.claims?.app_metadata;
  const providerValues =
    appMetadata && typeof appMetadata === "object"
      ? (appMetadata as { providers?: unknown; provider?: unknown })
      : {};
  const providers = Array.isArray(providerValues.providers)
    ? providerValues.providers.filter(
        (provider): provider is string => typeof provider === "string"
      )
    : typeof providerValues.provider === "string"
      ? [providerValues.provider]
      : [];
  const level = input.claims?.is_anonymous === true ? "A0" : undefined;
  if (level) {
    return {
      level,
      method: "anonymous",
      authAt: null,
      expiresAt: null,
    };
  }
  return computeAssurance({
    channel: "web",
    hasVerifiedSession: Boolean(
      input.claims && input.claims.sub === input.user.id
    ),
    aal,
    amr: input.claims?.amr ?? null,
    providers,
    org: attestation,
    freshMinutes: input.freshMinutes,
    now: input.now ?? new Date(),
  });
}
