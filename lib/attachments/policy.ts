import { createAdminClient } from "@/lib/supabase/admin";

export const DEFAULT_POLICY = {
  maxFilesPerTicket: 10,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  allowedMimeTypes: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
  ],
  retentionDays: 365,
} as const;

export type AttachmentPolicy = {
  maxFilesPerTicket: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  allowedMimeTypes: string[];
  retentionDays: number;
};

export async function getAttachmentPolicy(
  organizationId: string | null
): Promise<AttachmentPolicy> {
  if (!organizationId) {
    return {
      ...DEFAULT_POLICY,
      allowedMimeTypes: [...DEFAULT_POLICY.allowedMimeTypes],
      retentionDays: Number(
        process.env.HELP_DESK_ATTACHMENT_RETENTION_DAYS ??
          DEFAULT_POLICY.retentionDays
      ),
    };
  }

  const { data } = await createAdminClient()
    .from("attachment_policies")
    .select(
      "max_files_per_ticket,max_file_bytes,max_total_bytes,allowed_mime_types,retention_days"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) {
    return {
      ...DEFAULT_POLICY,
      allowedMimeTypes: [...DEFAULT_POLICY.allowedMimeTypes],
      retentionDays: Number(
        process.env.HELP_DESK_ATTACHMENT_RETENTION_DAYS ??
          DEFAULT_POLICY.retentionDays
      ),
    };
  }

  return {
    maxFilesPerTicket: data.max_files_per_ticket,
    maxFileBytes: data.max_file_bytes,
    maxTotalBytes: data.max_total_bytes,
    allowedMimeTypes: data.allowed_mime_types,
    retentionDays: data.retention_days,
  };
}
