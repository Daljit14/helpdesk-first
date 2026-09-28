"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buildBrowseReturnHref } from "@/lib/browse-return";

export function BackToResults() {
  const searchParams = useSearchParams();
  const href = buildBrowseReturnHref(searchParams);

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
