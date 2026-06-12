// Metadata wrapper for the (client-component) subscriptions page.
// `export const metadata` is only allowed in server files, so the page itself
// stays a client component and this thin server layout carries the SEO tags.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My subscriptions',
  description:
    'View and manage the experiences you have subscribed to on QuickIn — jet ski rentals, diving trips, yacht charters and more.',
  alternates: { canonical: '/subscriptions' },
  robots: { index: false, follow: true },
  openGraph: {
    title: 'My subscriptions | QuickIn',
    description: 'View and manage the experiences you have subscribed to on QuickIn.',
    url: '/subscriptions',
    type: 'website',
    siteName: 'QuickIn',
    images: [{ url: '/logo.png', width: 700, height: 454, alt: 'QuickIn' }],
  },
}

export default function SubscriptionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
