"use server";

import { revalidatePath } from "next/cache";
import { getIssueBySlug } from "@/lib/search";
import { getIssueSteps } from "@/lib/steps";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/user";
import { submitTicketSchema } from "@/lib/validation";
import type { User } from "@supabase/supabase-js";
import type { Issue } from "@/lib/issues";
import { recordAnalyticsEvent } from "@/lib/analytics/events";

type GuideActionError = { error: string };
type AuthenticatedIssueResult = GuideActionError | { user: User; issue: Issue };

async function authenticatedIssue(
  issueId: string
): Promise<AuthenticatedIssueResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "login-required" } as const;
  const issue = getIssueBySlug(issueId);
  if (!issue) return { error: "invalid-issue" } as const;
  return { user, issue } as const;
}

export async function toggleBookmark(
  issueId: string
): Promise<{ bookmarked: boolean } | GuideActionError> {
  const result = await authenticatedIssue(issueId);
  if ("error" in result) return result;
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookmarks")
    .select("issue_id")
    .eq("user_id", result.user.id)
    .eq("issue_id", result.issue.id)
    .maybeSingle();

  if (data) {
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("user_id", result.user.id)
      .eq("issue_id", result.issue.id);
    if (error) return { error: "Unable to update bookmark." };
    revalidatePath(`/issues/${result.issue.id}`);
    revalidatePath("/bookmarks");
    return { bookmarked: false };
  }

  const { error } = await supabase.from("bookmarks").upsert({
    user_id: result.user.id,
    issue_id: result.issue.id,
  });
  if (error) return { error: "Unable to update bookmark." };
  revalidatePath(`/issues/${result.issue.id}`);
  revalidatePath("/bookmarks");
  return { bookmarked: true };
}

export async function saveProgress(
  issueId: string,
  completedSteps: number[]
): Promise<{ success: true } | GuideActionError> {
  const result = await authenticatedIssue(issueId);
  if ("error" in result) return result;
  const stepCount = getIssueSteps(result.issue).length;
  const validSteps = [
    ...new Set(
      completedSteps.filter(
        (step) => Number.isInteger(step) && step >= 0 && step < stepCount
      )
    ),
  ];
  if (
    completedSteps.some(
      (step) => !Number.isInteger(step) || step < 0 || step >= stepCount
    )
  ) {
    return { error: "invalid-steps" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("guide_progress").upsert({
    user_id: result.user.id,
    issue_id: result.issue.id,
    completed_steps: validSteps,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Unable to save progress." };
  revalidatePath(`/issues/${result.issue.id}/guide`);
  return { success: true };
}

export async function rateGuide(
  issueId: string,
  vote: "up" | "down"
): Promise<{ success: true } | GuideActionError> {
  const result = await authenticatedIssue(issueId);
  if ("error" in result) return result;
  if (vote !== "up" && vote !== "down") return { error: "invalid-vote" };
  const supabase = await createClient();
  const { error } = await supabase.from("guide_ratings").upsert({
    user_id: result.user.id,
    issue_id: result.issue.id,
    vote,
  });
  if (error) return { error: "Unable to save rating." };
  revalidatePath(`/issues/${result.issue.id}`);
  return { success: true };
}

export type TicketActionState = {
  success?: boolean;
  fieldErrors?: Record<string, string>;
  error?: string;
} | null;

export async function submitTicket(
  _prevState: TicketActionState,
  formData: FormData
): Promise<TicketActionState> {
  const result = await authenticatedIssue(
    String(formData.get("issueId") ?? "")
  );
  if ("error" in result) {
    return result.error === "login-required"
      ? { error: result.error }
      : { fieldErrors: { issueId: "Choose a valid issue." } };
  }

  const parsed = submitTicketSchema.safeParse({
    issueId: formData.get("issueId"),
    message: formData.get("message"),
    attachmentPath: formData.get("attachmentPath") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const attachmentPath =
    parsed.data.attachmentPath &&
    parsed.data.attachmentPath.startsWith(`${result.user.id}/`) &&
    !parsed.data.attachmentPath.includes("..")
      ? parsed.data.attachmentPath
      : null;

  const supabase = await createClient();
  const { error } = await supabase.from("tickets").insert({
    user_id: result.user.id,
    issue_id: result.issue.id,
    issue_title: result.issue.title,
    message: parsed.data.message,
    attachment_path: attachmentPath,
  });
  if (error) return { error: "Unable to submit ticket." };
  await recordAnalyticsEvent({
    eventType: "ticket_created",
    path: `/issues/${result.issue.id}`,
    issueId: result.issue.id,
    visitorKey: "server",
    platform: null,
  });
  revalidatePath("/tickets");
  revalidatePath(`/issues/${result.issue.id}`);
  return { success: true };
}
