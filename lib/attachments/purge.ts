import { createAdminClient } from "@/lib/supabase/admin";
import { PRIVATE_BUCKET } from "@/lib/attachments/constants";

export async function purgeExpiredAttachments(): Promise<{
  deleted: number;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("purge_expired_attachments");
  if (error) throw error;
  const rows = (data ?? []) as { storage_path: string | null }[];
  const paths = rows
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));
  if (paths.length) await admin.storage.from(PRIVATE_BUCKET).remove(paths);
  return { deleted: rows.length };
}
