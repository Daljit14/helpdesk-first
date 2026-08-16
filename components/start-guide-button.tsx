"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

type StartGuideButtonProps = {
  slug: string;
};

export function StartGuideButton({ slug }: StartGuideButtonProps) {
  const searchParams = useSearchParams();
  const href = searchParams.toString()
    ? `/issues/${slug}/guide?${searchParams.toString()}`
    : `/issues/${slug}/guide`;

  return (
    <Link href={href} className={cn(buttonVariants({ variant: "default" }))}>
      <Wrench className="mr-2 h-4 w-4" />
      Start troubleshooting guide
    </Link>
  );
}
