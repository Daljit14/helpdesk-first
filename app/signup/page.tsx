import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="glass-strong w-full max-w-md space-y-6 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create an account
        </h1>
        <SignupForm />
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
