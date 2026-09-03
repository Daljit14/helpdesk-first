import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Check your email",
};

export default function ForgotPasswordSentPage() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="text-muted-foreground">
          If an account exists for that address, we sent a password reset link.
          It expires in about an hour.
        </p>
        <Link href="/login" className="underline underline-offset-4">
          Back to log in
        </Link>
      </div>
    </section>
  );
}
