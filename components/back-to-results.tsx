"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackToResults() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const href = query ? `/?${query}` : "/";

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to results
    </Link>
  );
}
