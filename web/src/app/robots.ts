import type { MetadataRoute } from 'next';

const siteUrl = 'https://volvox.dev';

/**
 * robots.txt — Next.js Metadata API
 *
 * Explicitly allow all AI agent crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.)
 * for maximum AI search visibility. Block private/dashboard routes for everyone.
 *
 * @see https://openai.com/gptbot
 * @see https://docs.anthropic.com/en/docs/build-with-claude/crawler
 */
export default function robots(): MetadataRoute.Robots {
  const disallowPaths = ['/dashboard/', '/login/', '/api/', '/community/'];

  // AI crawlers — explicit allow for maximum visibility in ChatGPT, Claude, Perplexity, Gemini
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

  // Traditional search crawlers
  rules.push(
    { userAgent: 'Googlebot', allow: '/', disallow: disallowPaths },
    { userAgent: 'Bingbot', allow: '/', disallow: disallowPaths },
  );

  // Default — allow everything, block private routes
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
