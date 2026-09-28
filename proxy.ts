import { NextResponse, type NextRequest } from "next/server";
import { getIssueBySlug } from "@/lib/search";
import { parseIssueRoutePath } from "@/lib/issue-route";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const issueRoute = parseIssueRoutePath(request.nextUrl.pathname);
  if (issueRoute && !getIssueBySlug(issueRoute.slug)) {
    return NextResponse.rewrite(new URL("/not-found", request.url), {
      status: 404,
    });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/__|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
