// Metadata wrapper for the (client-component) reservations page.
// `export const metadata` is only allowed in server files, so the page itself
// stays a client component and this thin server layout carries the SEO tags.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My reservations',
  description:
    'View and manage your upcoming QuickIn stays. Your boutique-rental bookings, all in one place.',
  alternates: { canonical: '/reservations' },
  robots: { index: false, follow: true },
  openGraph: {
    title: 'My reservations | QuickIn',
    description: 'View and manage your upcoming QuickIn stays.',
    url: '/reservations',
    type: 'website',
    siteName: 'QuickIn',
    images: [{ url: '/logo.png', width: 700, height: 454, alt: 'QuickIn' }],
  },
}

export default function ReservationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
