function isLocalhost(url: string): boolean {
  return (
    /^localhost(:\d+)?$/i.test(url) || /^127\.\d+\.\d+\.\d+(:\d+)?$/.test(url)
  );
}

export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "localhost:3000";

  let url = raw.trim();

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    const protocol = isLocalhost(url) ? "http" : "https";
    url = `${protocol}://${url}`;
  }

  return url.replace(/\/$/, "");
}
