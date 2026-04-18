import type { MetadataRoute } from 'next';

const PRODUCTION_URL = 'https://volvox.dev';

/**
 * sitemap.xml — Next.js Metadata API
 *
 * Static sitemap for public-facing pages. AI agents and search engines
 * use this to discover crawlable content. Dashboard and auth routes are excluded.
 *
 * Uses VERCEL_PROJECT_PRODUCTION_URL for the production domain on Vercel,
 * falling back to volvox.dev for local/self-hosted environments.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? PRODUCTION_URL;

  return [
    {
      url: siteUrl,
      lastModified: new Date('2026-04-18'),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date('2026-04-18'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: new Date('2026-04-18'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
}
