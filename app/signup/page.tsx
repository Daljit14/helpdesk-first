import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";
import { isGoogleSsoEnabled, isMicrosoftSsoEnabled } from "@/lib/admin/flags";
import { getTurnstileSiteKey } from "@/lib/auth/captcha";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Create an account",
};

function safeNextPath(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <PageHeader title="Create an account" />
        <SignupForm
          next={safeNextPath(next)}
          googleSsoEnabled={isGoogleSsoEnabled()}
          microsoftSsoEnabled={isMicrosoftSsoEnabled()}
          turnstileSiteKey={getTurnstileSiteKey()}
        />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
}
