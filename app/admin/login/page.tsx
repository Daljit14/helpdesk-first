import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminDashboardEnabled,
  isGoogleSsoEnabled,
  isMicrosoftSsoEnabled,
} from "@/lib/admin/flags";
import { getTurnstileSiteKey } from "@/lib/auth/captcha";
import { BrandMark } from "@/components/shell/brand-mark";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (!isAdminDashboardEnabled()) notFound();
  const params = await searchParams;
  const next =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/admin/operations";
  const initialError =
    params.error === "not_staff"
      ? "That account isn't a HelpDesk First staff account. Sign in with an authorized staff account."
      : params.error === "sso"
        ? "Google or Microsoft sign-in didn't complete. Please try again."
        : undefined;
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="glass-strong hf-rise w-full max-w-md p-8 shadow-[var(--shadow-md)] sm:p-9">
        <BrandMark className="mb-5 h-11 w-11" />
        <h1 className="text-3xl font-extrabold">Admin sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your authorized HelpDesk First account.
        </p>
        <div className="mt-8">
          <AdminLoginForm
            next={next}
            googleSsoEnabled={isGoogleSsoEnabled()}
            microsoftSsoEnabled={isMicrosoftSsoEnabled()}
            turnstileSiteKey={getTurnstileSiteKey()}
            initialError={initialError}
          />
        </div>
      </div>
    </section>
  );
}
