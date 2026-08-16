export default function Loading() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary"
        aria-label="Loading"
      />
      <p className="mt-4 text-muted-foreground">Loading…</p>
    </section>
  );
}
