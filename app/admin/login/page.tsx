import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { isAdminDashboardEnabled } from "@/lib/admin/flags";

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
    <section className="flex flex-1 items-center justify-center bg-white px-4 py-16 text-slate-900">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Admin sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use your authorized HelpDesk First account.
        </p>
        <div className="mt-8">
          <AdminLoginForm next={next} />
        </div>
      </div>
    </section>
  );
}
