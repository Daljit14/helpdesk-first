import type { Metadata } from "next";
import Link from "next/link";
import { HomePage } from "@/components/home-page";
import { platforms, type Platform } from "@/lib/helpdesk-data";

export const metadata: Metadata = {
  title: "Browse all solutions",
};

type PageSearchParams = {
  [key: string]: string | string[] | undefined;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function platform(value: string | string[] | undefined): Platform | null {
  const valueString = first(value);
  return platforms.includes(valueString as Platform)
    ? (valueString as Platform)
    : null;
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-4xl px-4 pt-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm underline underline-offset-4">
          ← Start
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">
          Browse all solutions
        </h1>
      </div>
      <HomePage
        initialQuery={first(params.q)}
        initialCategory={first(params.category) || null}
        initialPlatform={platform(params.platform)}
      />
    </div>
  );
}
