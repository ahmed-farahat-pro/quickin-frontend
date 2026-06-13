import type { Metadata } from 'next'
import {
  DM_Sans,
  Playfair_Display,
  Geist_Mono,
} from 'next/font/google'
import './globals.css'
import { JsonLd, organizationLd, webSiteLd } from './_components/structured-data'
import Providers from './_components/providers'

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

// Resolves relative OG/Twitter image URLs (e.g. /logo.png) and canonical URLs.
// Override by setting NEXT_PUBLIC_SITE_URL to the deployed frontend URL.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://quickin-frontend.vercel.app'

const DESCRIPTION =
  'QuickIn is a boutique vacation-rental marketplace for Egypt — handpicked stays in the North Coast, Ain Sokhna, El Gouna and Cairo. Search by area, book instantly, pay in EGP. Find it. Book it. Live it.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'QuickIn — Boutique Vacation Rentals in Egypt',
    template: '%s | QuickIn',
  },
  description: DESCRIPTION,
  applicationName: 'QuickIn',
  keywords: [
    'vacation rentals Egypt',
    'North Coast rentals',
    'Ain Sokhna chalets',
    'El Gouna villas',
    'Cairo apartments',
    'boutique stays',
    'Sahel rentals',
    'holiday homes Egypt',
    'book a stay Egypt',
    'إيجار شاليهات',
    'إيجار فيلات الساحل الشمالي',
    'العين السخنة',
    'الجونة',
  ],
  authors: [{ name: 'QuickIn' }],
  creator: 'QuickIn',
  publisher: 'QuickIn',
  category: 'travel',
  alternates: {
    canonical: '/',
    languages: { en: '/', ar: '/' },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  icons: { icon: '/logo-icon.png', apple: '/logo-icon.png' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['ar_EG'],
    url: siteUrl,
    title: 'QuickIn — Boutique Vacation Rentals in Egypt',
    description: DESCRIPTION,
    siteName: 'QuickIn',
    images: [{ url: '/logo-icon.png', width: 800, height: 600, alt: 'QuickIn' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QuickIn — Boutique Vacation Rentals in Egypt',
    description: DESCRIPTION,
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
      <body className="antialiased">
        {/* Site-wide structured data for SEO rich results + AEO (AI answer engines). */}
        <JsonLd data={organizationLd()} />
        <JsonLd data={webSiteLd()} />
        {/* Client i18n + RTL provider (sets <html lang/dir> after mount). */}
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
