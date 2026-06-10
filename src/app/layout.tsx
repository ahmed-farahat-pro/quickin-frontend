import type { Metadata } from 'next'
import {
  DM_Sans,
  Playfair_Display,
  Geist_Mono,
} from 'next/font/google'
import './globals.css'

// Body font
const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  display: 'swap',
})

// Hero headline font
const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  display: 'swap',
})

// Mono font
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Resolves relative OG/Twitter image URLs (e.g. /logo.png). Override by setting
// NEXT_PUBLIC_SITE_URL to the deployed frontend URL.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'QuickIn - Find It. Book It. Live It.',
    template: '%s | QuickIn',
  },
  description:
    'Curated stays for slow travelers. Handpicked homes designed for comfort, beauty, and calm.',
  keywords: [
    'vacation rentals',
    'boutique stays',
    'travel',
    'accommodation',
    'curated homes',
  ],
  icons: {
    icon: '/logo-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'QuickIn - Find It. Book It. Live It.',
    description:
      'Curated stays for slow travelers. Handpicked homes designed for comfort, beauty, and calm.',
    siteName: 'QuickIn',
    images: [
      {
        url: '/logo-icon.png',
        width: 800,
        height: 600,
        alt: 'QuickIn Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QuickIn - Find It. Book It. Live It.',
    description:
      'Curated stays for slow travelers. Handpicked homes designed for comfort, beauty, and calm.',
    images: ['/logo-icon.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${playfair.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  )
}
