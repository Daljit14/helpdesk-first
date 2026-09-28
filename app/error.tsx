"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { CircleAlert } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to the console for debugging; do not send to an external service.
    console.error(error);
  }, [error]);

  return (
    <section className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <EmptyState
        icon={CircleAlert}
        title="Something went wrong"
        headingLevel={1}
        description="We could not load this page. Try again or return to Start."
        actions={
          <>
            <Button type="button" onClick={reset}>
              Try again
            </Button>
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "outline" }))}
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
