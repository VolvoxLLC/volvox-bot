import type { MetadataRoute } from 'next';

const PRODUCTION_URL = 'https://volvox.bot';

/**
 * robots.txt — Next.js Metadata API
 *
 * Allow all crawlers (AI agents + traditional search) on public pages.
 * Block dashboard, auth, API, and community routes.
 *
 * @see https://openai.com/gptbot
 * @see https://docs.anthropic.com/en/docs/build-with-claude/crawler
 */
export default function robots(): MetadataRoute.Robots {
  const rawUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? PRODUCTION_URL;
  const siteUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
  const disallowPaths = ['/dashboard', '/login', '/api', '/community'];

  const aiAgents = [
    'GPTBot',
    'ChatGPT-User',
    'OAI-SearchBot',
    'ClaudeBot',
    'anthropic-ai',
    'PerplexityBot',
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
  ];

  const rules: MetadataRoute.Robots['rules'] = aiAgents.map((userAgent) => ({
    userAgent,
    allow: '/',
    disallow: disallowPaths,
  }));

  rules.push(
    { userAgent: 'Googlebot', allow: '/', disallow: disallowPaths },
    { userAgent: 'Bingbot', allow: '/', disallow: disallowPaths },
  );

  rules.push({
    userAgent: '*',
    allow: '/',
    disallow: disallowPaths,
  });

  return {
    rules,
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
