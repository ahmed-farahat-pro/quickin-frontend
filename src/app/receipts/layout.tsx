// Metadata wrapper for the (client-component) receipts page.
// `export const metadata` is only allowed in server files, so the page itself
// stays a client component and this thin server layout carries the SEO tags.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Your receipts',
  description:
    'Your paid QuickIn stays, itemized — subtotal, fees, discounts, and totals for every booking.',
  alternates: { canonical: '/receipts' },
  robots: { index: false, follow: true },
  openGraph: {
    title: 'Your receipts | QuickIn',
    description: 'Your paid QuickIn stays, itemized.',
    url: '/receipts',
    type: 'website',
    siteName: 'QuickIn',
    images: [{ url: '/logo.png', width: 700, height: 454, alt: 'QuickIn' }],
  },
}

export default function ReceiptsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
