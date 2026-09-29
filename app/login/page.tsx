import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import type { Metadata } from "next";
import { isGoogleSsoEnabled, isMicrosoftSsoEnabled } from "@/lib/admin/flags";
import { getTurnstileSiteKey } from "@/lib/auth/captcha";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Log in",
};

function safeNextPath(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);

  return (
    <section className="hero-wash flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-md space-y-6 rounded-[32px] border border-border bg-card p-7 shadow-md sm:p-9">
        <PageHeader title="Log in" />
        <LoginForm
          next={safeNext}
          googleSsoEnabled={isGoogleSsoEnabled()}
          microsoftSsoEnabled={isMicrosoftSsoEnabled()}
          turnstileSiteKey={getTurnstileSiteKey()}
        />
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </div>
    </section>
  );
}
