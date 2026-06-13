import type { MetadataRoute } from 'next'

// robots.txt (served at /robots.txt). Public pages are crawlable; private/auth
// areas are not. We EXPLICITLY welcome AI answer-engine crawlers (GPTBot,
// PerplexityBot, ClaudeBot, Google-Extended, Applebot-Extended, …) so QuickIn
// can be cited in AI answers — this is the heart of AEO.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://quickin-frontend.vercel.app'

const AI_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'Google-Extended',
  'Applebot',
  'Applebot-Extended',
  'Amazonbot',
  'Bingbot',
  'CCBot',
  'cohere-ai',
  'Meta-ExternalAgent',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Auth-gated / private surfaces have no search value.
        disallow: ['/admin', '/account', '/host', '/reservations', '/subscriptions', '/api/'],
      },
      {
        userAgent: AI_AGENTS,
        allow: ['/', '/explore', '/services', '/faq'],
        disallow: ['/admin', '/account', '/host', '/api/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
