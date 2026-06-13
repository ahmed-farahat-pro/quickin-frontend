// Android Digital Asset Links — served at
//   https://quickin-frontend.vercel.app/.well-known/assetlinks.json
//
// This file is what makes Android *App Links* (verified deep links) open the
// QuickIn app instead of the browser: when the app is installed and the user
// taps a quickin-frontend.vercel.app link, Android checks this file and — if
// the signing fingerprint matches — opens the app directly; otherwise it falls
// back to the website.
//
// Served from a Next.js route handler (not /public) so we control the exact
// Content-Type (`application/json`) — the most reliable way to serve this on
// Vercel. Android *does* require the `.json` extension, which the folder name
// (`assetlinks.json/route.ts`) provides.
//
// ─────────────────────────────────────────────────────────────────────────
// ACTION REQUIRED: paste the app's RELEASE signing SHA-256 fingerprint below.
//   Get it from one of:
//     • Play Console → your app → Setup → App integrity → App signing
//       (copy the "SHA-256 certificate fingerprint"), or
//     • keytool -list -v -keystore <release.keystore> -alias <alias>
//       (copy the SHA-256 line).
//   The value is colon-separated uppercase hex, e.g.
//       AA:BB:CC:...:FF
//   Then either:
//     • set NEXT_PUBLIC_ANDROID_SHA256 in your Vercel env, or
//     • edit the REPLACE_WITH_RELEASE_SHA256 placeholder just below.
// Until a real fingerprint is set, Android App Link auto-verification will NOT
// succeed (a custom URL scheme still works for testing).
// ─────────────────────────────────────────────────────────────────────────

// 👇 REPLACE with the app's release SHA-256 fingerprint (or set the env var).
const ANDROID_SHA256 =
  process.env.NEXT_PUBLIC_ANDROID_SHA256 || 'REPLACE_WITH_RELEASE_SHA256'

const ANDROID_PACKAGE = 'com.quickin.app'

// Static at build time — the body never changes per-request.
export const dynamic = 'force-static'

export function GET() {
  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: [ANDROID_SHA256],
      },
    },
  ]

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
