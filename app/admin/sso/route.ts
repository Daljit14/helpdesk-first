import { NextResponse, type NextRequest } from "next/server";
import { establishAdminSession } from "@/lib/admin/auth";
import { getCurrentUser } from "@/lib/supabase/user";
import { isAdminDashboardEnabled } from "@/lib/admin/flags";

export async function GET(request: NextRequest) {
  if (!isAdminDashboardEnabled()) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  const user = await getCurrentUser();
  const provider = request.nextUrl.searchParams.get("provider");
  if (
    !user ||
    (provider !== "google" && provider !== "azure") ||
    !(await establishAdminSession(user, `sso:${provider}`))
  ) {
    return NextResponse.redirect(
      new URL("/admin/login?error=not_staff", request.url)
    );
  }
  return NextResponse.redirect(new URL("/admin", request.url));
}
