import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchX } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <section className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <EmptyState
        icon={SearchX}
        title="404 — Page not found"
        headingLevel={1}
        description="We could not find that page. Try browsing the available solutions."
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
