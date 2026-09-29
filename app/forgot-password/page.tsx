import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getTurnstileSiteKey } from "@/lib/auth/captcha";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Reset your password",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const showExpired = error === "expired";

  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full hf-rise max-w-md space-y-6 rounded-[28px] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <PageHeader title="Reset your password" />
        <p className="text-muted-foreground">
          Enter your account email and we&apos;ll send you a link to choose a
          new password.
        </p>
        {showExpired && (
          <p className="text-sm text-destructive">
            That reset link is invalid or has expired. Request a new one below.
          </p>
        )}
        <ForgotPasswordForm turnstileSiteKey={getTurnstileSiteKey()} />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline underline-offset-4">
            Back to log in
          </Link>
        </p>
      </div>
    </section>
  );
}
