import type { MetadataRoute } from "next";
import { getAllIssueSlugs } from "@/lib/search";
import { getSiteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const issueSlugs = getAllIssueSlugs();

  const issuePages = issueSlugs.map((slug) => ({
    url: `${baseUrl}/issues/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const guidePages = issueSlugs.map((slug) => ({
    url: `${baseUrl}/issues/${slug}/guide`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    ...issuePages,
    ...guidePages,
  ];
}
