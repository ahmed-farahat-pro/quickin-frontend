// Metadata wrapper for the (client-component) host dashboard.
// `export const metadata` is only allowed in server files, so the page itself
// stays a client component and this thin server layout carries the SEO tags.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Host dashboard',
  description:
    'Publish boutique stays, manage your listings, and respond to reservation requests on QuickIn.',
  alternates: { canonical: '/host' },
  robots: { index: false, follow: true },
  openGraph: {
    title: 'Host dashboard | QuickIn',
    description:
      'Publish boutique stays, manage your listings, and respond to reservation requests.',
    url: '/host',
    type: 'website',
    siteName: 'QuickIn',
    images: [{ url: '/logo.png', width: 700, height: 454, alt: 'QuickIn' }],
  },
}

export default function HostLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
