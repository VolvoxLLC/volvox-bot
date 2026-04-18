import type { MetadataRoute } from 'next';

/**
 * sitemap.xml — Next.js Metadata API
 *
 * Static sitemap for public-facing pages. AI agents and search engines
 * use this to discover crawlable content. Dashboard and auth routes are excluded.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = 'https://volvox.dev';
  const now = new Date();

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
}
