// Root route → send visitors straight to the Explore experience.
import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/explore')
}
