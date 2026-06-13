import type { MetadataRoute } from 'next'
import { API_URL, type Listing } from '@/lib/api'

// sitemap.xml (served at /sitemap.xml). Static marketing/search pages plus one
// entry per published listing, fetched from the backend. Revalidated hourly.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://quickin-frontend.vercel.app'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/explore`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${siteUrl}/services`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${siteUrl}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${siteUrl}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/signup`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Region landing URLs (?region=) help search engines index each area.
  const regionEntries: MetadataRoute.Sitemap = ['North Coast', 'Ain Sokhna', 'El Gouna', 'Cairo'].map(
    (r) => ({
      url: `${siteUrl}/explore?region=${encodeURIComponent(r)}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    })
  )

  let listingEntries: MetadataRoute.Sitemap = []
  try {
    const res = await fetch(`${API_URL}/api/local/listings`, { next: { revalidate: 3600 } })
    if (res.ok) {
      const listings = (await res.json()) as Listing[]
      listingEntries = (Array.isArray(listings) ? listings : []).map((l) => ({
        url: `${siteUrl}/explore/${l.id}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.8,
      }))
    }
  } catch {
    // Backend unreachable at build time → ship the static + region map only.
  }

  return [...staticEntries, ...regionEntries, ...listingEntries]
}
