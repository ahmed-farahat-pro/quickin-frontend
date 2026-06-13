// Apple App Site Association (AASA) — served at
//   https://quickin-frontend.vercel.app/.well-known/apple-app-site-association
//
// This file is what makes iOS *Universal Links* resolve to the QuickIn app
// instead of opening Safari: when the app is installed and the user taps a
// quickin-frontend.vercel.app link whose path matches one of the patterns
// below, iOS opens the app directly; otherwise it falls back to the website.
//
// Served from a Next.js route handler (not /public) so we control the exact
// Content-Type (`application/json`) — the most reliable way to serve AASA on
// Vercel. Apple does NOT require a `.json` extension, so the path has none.
//
// ─────────────────────────────────────────────────────────────────────────
// ACTION REQUIRED: replace the Apple Team ID below.
//   `appID` must be "<TEAM_ID>.<bundle id>", e.g. "ABCDE12345.com.quickin.ahmed".
//   Find your 10-char Team ID in the Apple Developer portal → Membership, or in
//   Xcode → Signing & Capabilities. Either:
//     • set NEXT_PUBLIC_APPLE_TEAM_ID in your Vercel env, or
//     • edit the TEAMID placeholder constant just below.
// Until a real Team ID is set, iOS auto-verification will NOT succeed (a custom
// URL scheme still works for testing).
// ─────────────────────────────────────────────────────────────────────────

// 👇 REPLACE with your real 10-character Apple Team ID (or set the env var).
const TEAMID = process.env.NEXT_PUBLIC_APPLE_TEAM_ID || 'TEAMID'

const IOS_BUNDLE_ID = 'com.quickin.ahmed'

// Paths that should open the app when it's installed. '*' is a wildcard.
const APP_PATHS = ['/explore/*', '/services/*', '/reservation/*', '/']

// Static at build time — the body never changes per-request.
export const dynamic = 'force-static'

export function GET() {
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${TEAMID}.${IOS_BUNDLE_ID}`,
          paths: APP_PATHS,
        },
      ],
    },
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Let CDNs/clients cache it; it's effectively static config.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
