"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

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
    <section className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center sm:px-6 lg:px-8">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        We are sorry, but we encountered an unexpected error. You can try again
        or return to the home page.
      </p>
      <div className="mt-8 flex gap-3">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to home
        </Link>
      </div>
    </section>
  );
}
