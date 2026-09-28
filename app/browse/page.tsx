import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import { normalizePlatform } from "@/lib/platform";

export const metadata: Metadata = {
  title: "Browse all solutions",
};

type PageSearchParams = {
  [key: string]: string | string[] | undefined;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const rawPlatform = first(params.platform);
  const initialPlatform = normalizePlatform(rawPlatform);
  return (
    <HomePage
      initialQuery={first(params.q)}
      initialCategory={first(params.category) || null}
      initialPlatform={initialPlatform}
      initialPlatformInvalid={Boolean(rawPlatform.trim()) && !initialPlatform}
      basePath="/browse"
    />
  );
}
