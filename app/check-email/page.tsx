export default function CheckEmailPage() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-muted-foreground">
          We sent a confirmation link. Click it to finish creating your account.
        </p>
      </div>
    </section>
  );
}
