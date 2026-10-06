import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/user";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/auth/paths";
import { getSiteUrl } from "@/lib/site-url";

const STEP_UP_DONE = "/auth/step-up/done";

export async function GET(request: NextRequest) {
  const next = safeNextPath(
    request.nextUrl.searchParams.get("next"),
    "/assistant"
  );
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}`, request.url)
    );
  }

  const provider = user.app_metadata.provider;
  const providers = Array.isArray(user.app_metadata.providers)
    ? user.app_metadata.providers.filter(
        (value: unknown): value is string => typeof value === "string"
      )
    : [];
  if (
    isSupabaseConfigured() &&
    providers.length === 1 &&
    providers[0] === provider &&
    (provider === "azure" || provider === "google")
  ) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(STEP_UP_DONE)}`,
        scopes: "email openid profile",
        ...(provider === "azure"
          ? { queryParams: { prompt: "login", max_age: "0" } }
          : {}),
      },
    });
    if (!error && data.url) return NextResponse.redirect(data.url);
  }

  return NextResponse.redirect(
    new URL(
      `/login?reauth=1&next=${encodeURIComponent(STEP_UP_DONE)}`,
      request.url
    )
  );
}
