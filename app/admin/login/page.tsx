import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminDashboardEnabled,
  isGoogleSsoEnabled,
  isMicrosoftSsoEnabled,
} from "@/lib/admin/flags";
import { getTurnstileSiteKey } from "@/lib/auth/captcha";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isAdminDashboardEnabled()) notFound();
  const params = await searchParams;
  const next =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/admin/operations";
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="glass-strong w-full max-w-md p-8">
        <h1 className="text-2xl font-bold">Admin sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your authorized HelpDesk First account.
        </p>
        <div className="mt-8">
          <AdminLoginForm
            next={next}
            googleSsoEnabled={isGoogleSsoEnabled()}
            microsoftSsoEnabled={isMicrosoftSsoEnabled()}
            turnstileSiteKey={getTurnstileSiteKey()}
          />
        </div>
      </div>
    </section>
  );
}
