"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/supabase/user";
import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationPreferenceInput = {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
};

export async function getNotificationPreferences() {
  const user = await getCurrentUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("notification_preferences")
    .select("email_enabled,push_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  return {
    userId: user.id,
    emailEnabled: data?.email_enabled ?? true,
    pushEnabled: data?.push_enabled ?? true,
  };
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferenceInput
) {
  const user = await getCurrentUser();
  if (!user || user.id !== userId) return { error: "Not authorized." };
  const admin = createAdminClient();
  const { error } = await admin.from("notification_preferences").upsert({
    user_id: userId,
    email_enabled:
      typeof input.emailEnabled === "boolean" ? input.emailEnabled : true,
    push_enabled:
      typeof input.pushEnabled === "boolean" ? input.pushEnabled : true,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Unable to save preferences." };
  revalidatePath("/tickets");
  return { success: true };
}
