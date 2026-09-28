import { HomePage } from "@/components/home-page";
import { normalizePlatform } from "@/lib/platform";
import { HomeStart } from "@/components/v2/home-start";
import { isUiV2Enabled } from "@/lib/ui-v2";
import { getCurrentUser } from "@/lib/supabase/user";

type PageSearchParams = {
  [key: string]: string | string[] | undefined;
};

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

  if (isUiV2Enabled()) {
    const user = await getCurrentUser();
    return <HomeStart signedIn={Boolean(user)} />;
  }

  return (
    <HomePage
      initialQuery={parseString(params.q)}
      initialCategory={parseString(params.category) || null}
      initialPlatform={normalizePlatform(params.platform)}
    />
  );
}
