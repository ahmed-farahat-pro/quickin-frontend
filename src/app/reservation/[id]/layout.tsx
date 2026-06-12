// Metadata wrapper for the (client-component) single-reservation page.
// `export const metadata` is only allowed in server files; the page itself
// stays a client component (it reads the bearer token + draws the QR locally).
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Your reservation',
  description:
    'Your QuickIn reservation details and check-in QR code.',
  robots: { index: false, follow: false },
}

export default function ReservationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
