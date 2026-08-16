import type { MetadataRoute } from "next";
import { getAllIssueSlugs } from "@/lib/search";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://helpdesk-first.vercel.app";

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
    ...issuePages,
    ...guidePages,
  ];
}
