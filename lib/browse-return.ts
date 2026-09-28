import { normalizePlatform, platformSlug } from "./platform";

type BrowseParams =
  URLSearchParams | Record<string, string | string[] | undefined>;

function valueOf(params: BrowseParams, key: string): string {
  if (params instanceof URLSearchParams) return params.get(key) ?? "";
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function buildBrowseReturnHref(params: BrowseParams): string {
  const query = new URLSearchParams();
  const q = valueOf(params, "q");
  const category = valueOf(params, "category");
  const platform = normalizePlatform(valueOf(params, "platform"));
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  if (platform) query.set("platform", platformSlug(platform));
  const suffix = query.toString();
  return suffix ? `/browse?${suffix}` : "/browse";
}
