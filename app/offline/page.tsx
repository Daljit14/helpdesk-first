import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <WifiOff className="h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">
        You&apos;re offline
      </h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        This page hasn&apos;t been saved for offline use yet. Guides you&apos;ve
        already opened are still available — try going back or reconnecting.
      </p>
    </section>
  );
}
