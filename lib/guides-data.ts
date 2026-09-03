import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type ProgressRow = {
  completed_steps: number[] | null;
};

type RatingRow = {
  vote: "up" | "down";
};

export type Ticket = {
  id: string;
  issue_id: string;
  issue_title: string;
  message: string;
  status: string;
  created_at: string;
};

export async function getBookmarkedIssueIds(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured() || !userId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookmarks")
    .select("issue_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => row.issue_id);
}

export async function getProgress(
  userId: string,
  issueId: string
): Promise<number[]> {
  if (!isSupabaseConfigured() || !userId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("guide_progress")
    .select("completed_steps")
    .eq("user_id", userId)
    .eq("issue_id", issueId)
    .maybeSingle();
  return (data as ProgressRow | null)?.completed_steps ?? [];
}

export async function getUserRating(
  userId: string,
  issueId: string
): Promise<"up" | "down" | null> {
  if (!isSupabaseConfigured() || !userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("guide_ratings")
    .select("vote")
    .eq("user_id", userId)
    .eq("issue_id", issueId)
    .maybeSingle();
  return (data as RatingRow | null)?.vote ?? null;
}

export async function getRatingTotals(
  issueId: string
): Promise<{ up: number; down: number }> {
  if (!isSupabaseConfigured()) return { up: 0, down: 0 };
  const supabase = await createClient();
  const { data } = await supabase
    .from("guide_rating_totals")
    .select("up_count, down_count")
    .eq("issue_id", issueId)
    .maybeSingle();
  return {
    up: data?.up_count ?? 0,
    down: data?.down_count ?? 0,
  };
}

export async function getTickets(userId: string): Promise<Ticket[]> {
  if (!isSupabaseConfigured() || !userId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select("id, issue_id, issue_title, message, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Ticket[];
}
