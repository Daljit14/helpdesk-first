import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import type { Metadata } from "next";
import { isGoogleSsoEnabled, isMicrosoftSsoEnabled } from "@/lib/admin/flags";
import { getTurnstileSiteKey } from "@/lib/auth/captcha";
import { PageHeader } from "@/components/ui/page-header";
import { safeNextPath } from "@/lib/auth/paths";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; reauth?: string }>;
}) {
  const { next, reauth } = await searchParams;
  const safeNext = safeNextPath(next);
  const isReauth = reauth === "1";

  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full hf-rise max-w-md space-y-6 rounded-[28px] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <PageHeader title={isReauth ? "Confirm it's you" : "Log in"} />
        <LoginForm
          next={safeNext}
          googleSsoEnabled={isGoogleSsoEnabled()}
          microsoftSsoEnabled={isMicrosoftSsoEnabled()}
          turnstileSiteKey={getTurnstileSiteKey()}
        />
        {!isReauth && (
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Sign up
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
