import type { MetadataRoute } from 'next';

const PRODUCTION_URL = 'https://volvox.bot';

/**
 * sitemap.xml — Next.js Metadata API
 *
 * Static sitemap for public-facing pages. AI agents and search engines
 * use this to discover crawlable content. Dashboard and auth routes are excluded.
 *
 * Uses NEXT_PUBLIC_SITE_URL for the production domain, falling back to
 * volvox.bot for local development.
 * Ensures the URL always includes a protocol, defaulting to https:// when omitted.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const rawUrl = configuredSiteUrl || PRODUCTION_URL;
  const siteUrl = (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).replace(/\/$/, '');

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
}
