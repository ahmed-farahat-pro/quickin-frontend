import { MetadataRoute } from 'next'
import { getListings } from '@/lib/local/db'
import { getBaseUrl } from '@/lib/utils'

// The sitemap reads the SAME Neon source the browse page does — getListings()
// already filters to is_published + approval_status='approved', so an unapproved
// or unpublished listing can never leak into the sitemap. It used to read the
// retired Supabase project and emit /listings/:id, which the proxy 308s to
// /explore with the id dropped; the canonical listing URL is /explore/:id.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const currentDate = new Date()

  const sitemapEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/links`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  // A sitemap that throws fails the whole route, so a database hiccup must
  // degrade to the static pages above rather than 500.
  try {
    const listings = await getListings()
    for (const listing of listings) {
      sitemapEntries.push({
        url: `${baseUrl}/explore/${listing.id}`,
        lastModified: listing.created_at
          ? new Date(listing.created_at)
          : currentDate,
        changeFrequency: 'daily',
        priority: 0.9,
      })
    }
  } catch (error) {
    console.error('sitemap: could not read listings —', error)
  }

  return sitemapEntries
}
