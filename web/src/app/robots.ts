import type { MetadataRoute } from 'next';

/**
 * robots.txt — Next.js Metadata API
 *
 * Allow all crawlers on public pages. Block dashboard, login, and API routes.
 * Optimize for AI agents by pointing to sitemap and providing clear crawl rules.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = 'https://volvox.dev';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: ['/dashboard/', '/login/', '/api/', '/community/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
