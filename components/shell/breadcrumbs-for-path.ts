import { getIssueBySlug } from "@/lib/search";
import type { BreadcrumbItem } from "@/components/ui/breadcrumbs";

export function breadcrumbsForPath(pathname: string): BreadcrumbItem[] {
  if (pathname === "/") return [{ label: "Start" }];
  if (pathname === "/browse") {
    return [{ label: "Start", href: "/" }, { label: "Browse solutions" }];
  }
  if (pathname.startsWith("/issues/")) {
    const parts = pathname.split("/").filter(Boolean);
    const issue = getIssueBySlug(parts[1]);
    const issueLabel = issue?.title ?? "Issue";
    const items: BreadcrumbItem[] = [
      { label: "Start", href: "/" },
      { label: "Browse solutions", href: "/browse" },
      { label: issueLabel },
    ];
    if (parts[2] === "guide") items.push({ label: "Guide" });
    return items;
  }
  const labels: Record<string, string> = {
    "/assistant": "Support Assistant",
    "/tickets": "My tickets",
    "/bookmarks": "Bookmarks",
    "/status": "System status",
    "/login": "Log in",
    "/signup": "Create an account",
    "/forgot-password": "Reset your password",
    "/reset-password": "Choose a new password",
    "/check-email": "Verify your email",
    "/offline": "Offline",
  };
  return [
    { label: "Start", href: "/" },
    { label: labels[pathname] ?? "HelpDesk First" },
  ];
}
