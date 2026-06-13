import type { MetadataRoute } from 'next'

// Web app manifest (served at /manifest.webmanifest). Improves installability +
// gives search engines structured app metadata.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'QuickIn — Boutique Vacation Rentals in Egypt',
    short_name: 'QuickIn',
    description:
      'Handpicked boutique stays across Egypt’s North Coast, Ain Sokhna, El Gouna and Cairo. Find it. Book it. Live it.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F1E6',
    theme_color: '#5B0F16',
    lang: 'en',
    dir: 'ltr',
    categories: ['travel', 'lifestyle', 'shopping'],
    icons: [
      { src: '/logo-icon.png', sizes: 'any', type: 'image/png', purpose: 'any' },
    ],
  }
}
