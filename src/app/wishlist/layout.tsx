// Metadata wrapper for the (client-component) wishlist page. `export const
// metadata` is only allowed in server files, so the page itself stays a client
// component and this thin server layout carries the SEO tags.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Saved stays',
  description:
    'Your saved QuickIn stays and experiences — the boutique homes and services you loved, kept in one place.',
  alternates: { canonical: '/wishlist' },
  robots: { index: false, follow: true },
  openGraph: {
    title: 'Saved stays | QuickIn',
    description: 'Your saved QuickIn stays and experiences, all in one place.',
    url: '/wishlist',
    type: 'website',
    siteName: 'QuickIn',
    images: [{ url: '/logo.png', width: 700, height: 454, alt: 'QuickIn' }],
  },
}

export default function WishlistLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
