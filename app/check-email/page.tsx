import type { Metadata } from "next";
import { SignupVerificationForm } from "@/components/auth/signup-verification-form";
import { isSafeNextPath } from "@/lib/auth/paths";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Verify your email",
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const params = await searchParams;
  const email = params.email?.trim() || "";
  const next = params.next && isSafeNextPath(params.next) ? params.next : "/";

  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-8 shadow-sm">
        <PageHeader title="Verify your email" />
        <p className="text-muted-foreground">
          We sent a 6-digit code to {email || "your email address"}.
        </p>
        {email ? (
          <SignupVerificationForm email={email} next={next} />
        ) : (
          <p className="text-sm text-destructive">
            Return to sign up to request a verification code.
          </p>
        )}
      </div>
    </section>
  );
}
