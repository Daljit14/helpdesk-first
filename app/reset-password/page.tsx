import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Choose a new password",
};

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) {
    redirect("/forgot-password?error=expired");
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=expired");
  }

  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full hf-rise max-w-md space-y-6 rounded-[28px] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <PageHeader title="Choose a new password" />
        <ResetPasswordForm />
      </div>
    </section>
  );
}
