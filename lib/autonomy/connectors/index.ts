import { openSecret } from "@/lib/security/secret-box";
import { EntraDirectory } from "./entra";
import { GoogleWorkspaceDirectory } from "./google-workspace";
import type { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConnectorConfig,
  DirectoryProvider,
  IdentityDirectory,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export async function loadDirectoryForOrganization(
  admin: Admin,
  organizationId: string
): Promise<{ directory: IdentityDirectory; config: ConnectorConfig } | null> {
  const result = await admin
    .from("organization_connectors")
    .select(
      "organization_id,provider,config,secret_ciphertext,allowed_group_ids,reset_url,status"
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (result.error || !result.data) return null;
  try {
    const row = result.data as {
      organization_id: string;
      provider: DirectoryProvider;
      config: Record<string, string>;
      secret_ciphertext: string;
      allowed_group_ids: string[] | null;
      reset_url: string | null;
      status: string;
    };
    const config: ConnectorConfig = {
      provider: row.provider,
      organizationId: row.organization_id,
      config: row.config,
      secret: openSecret(row.secret_ciphertext),
      allowedGroupIds: row.allowed_group_ids ?? [],
      resetUrl: row.reset_url,
    };
    return {
      config,
      directory:
        config.provider === "entra"
          ? new EntraDirectory(config)
          : new GoogleWorkspaceDirectory(config),
    };
  } catch {
    return null;
  }
}

export { EntraDirectory } from "./entra";
export { GoogleWorkspaceDirectory } from "./google-workspace";
export type * from "./types";
