export default function Loading() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="sr-only">Loading HelpDesk First</h1>
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading content</span>
        <span
          aria-hidden="true"
          className="block h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary"
        />
      </div>
      <p className="mt-4 text-muted-foreground">Loading…</p>
    </section>
  );
}
