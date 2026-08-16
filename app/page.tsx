import { HomePage } from "@/components/home-page";
import { platforms, type Platform } from "@/lib/helpdesk-data";

type PageSearchParams = {
  [key: string]: string | string[] | undefined;
};

function parsePlatform(value: string | string[] | undefined): Platform | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (first && platforms.includes(first as Platform)) {
    return first as Platform;
  }
  return null;
}

function parseString(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? "";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;

  return (
    <HomePage
      initialQuery={parseString(params.q)}
      initialCategory={parseString(params.category) || null}
      initialPlatform={parsePlatform(params.platform)}
    />
  );
}
