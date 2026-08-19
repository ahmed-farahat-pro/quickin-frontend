import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // App Store / Google Play account-deletion URL. The app uses next-intl WITHOUT
  // URL-path locales (no /[locale] routing), so the deletion page lives at
  // /account/delete and we rewrite the locale-prefixed form (e.g.
  // /en/account/delete) onto it, preserving the requested URL.
  async rewrites() {
    return [
      { source: '/:locale(en|ar|fr|es)/account/delete', destination: '/account/delete' },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'dummy.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
        pathname: '/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
