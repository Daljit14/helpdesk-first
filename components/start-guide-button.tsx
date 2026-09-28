"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { normalizePlatform, platformSlug } from "@/lib/platform";

type StartGuideButtonProps = {
  slug: string;
};

export function StartGuideButton({ slug }: StartGuideButtonProps) {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const platform = normalizePlatform(params.get("platform"));
  if (platform) params.set("platform", platformSlug(platform));
  const query = params.toString();
  const href = query
    ? `/issues/${slug}/guide?${query}`
    : `/issues/${slug}/guide`;

  return (
    <Link href={href} className={cn(buttonVariants({ variant: "default" }))}>
      <Wrench className="mr-2 h-4 w-4" />
      Start troubleshooting guide
    </Link>
  );
}
