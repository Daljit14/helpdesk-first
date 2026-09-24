import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export async function resolveDeviceOwnerEmails(
  admin: Admin,
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  await Promise.all(
    [
      ...new Set(userIds.filter((value): value is string => Boolean(value))),
    ].map(async (userId) => {
      try {
        const result = await admin.auth.admin.getUserById(userId);
        if (!result.error && result.data.user?.email)
          owners.set(userId, result.data.user.email);
      } catch {
        // Owner lookup is best effort.
      }
    })
  );
  return owners;
}
