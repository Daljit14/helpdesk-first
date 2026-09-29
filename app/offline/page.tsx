import { WifiOff } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export default function OfflinePage() {
  return (
    <section className="flex flex-1 flex-col justify-center px-6 py-24">
      <EmptyState
        icon={WifiOff}
        title="You're offline"
        headingLevel={1}
        description="Guides you've already opened may still be available. Reconnect and try again."
        actions={
          <>
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Back to Start
            </Link>
            <Link
              href="/browse"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Browse solutions
            </Link>
          </>
        }
      />
    </section>
  );
}
