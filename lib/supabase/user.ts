import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";
import { isSupabaseConfigured } from "./config";

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
