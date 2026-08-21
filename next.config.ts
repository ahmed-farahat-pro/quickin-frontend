import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // App Store / Google Play account-deletion URL. The app uses next-intl WITHOUT
  // URL-path locales (no /[locale] routing), so the deletion page lives at
  // /account/delete and we rewrite the locale-prefixed form (e.g.
  // /en/account/delete) onto it, preserving the requested URL.
  async rewrites() {
    // Everything under /api is served by quickin-backend. This app has no API routes
    // of its own any more — it is the UI, and the backend owns the data.
    //
    // A rewrite rather than pointing the browser at the backend's origin directly:
    // the browser keeps talking to this origin, so the qk_token and qk_staff cookies
    // are sent as first-party on every call. Cross-origin would mean CORS, SameSite
    // and third-party-cookie problems for nothing.
    const backend = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000')
      .replace(/\/+$/, '')
    return [
      { source: '/:locale(en|ar|fr|es)/account/delete', destination: '/account/delete' },
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
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
