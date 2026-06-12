// Sign in with Apple (web) via Apple's JS SDK.
//
// Web Apple needs an Apple **Services ID** (NOT the app bundle id) configured
// with this site's domain + return URL, and the domain verified by hosting
// /.well-known/apple-developer-domain-association.txt. The button is gated on
// NEXT_PUBLIC_APPLE_SERVICES_ID — when that's empty the Apple button is hidden,
// so no half-working button is shown.

export const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID || ''
const APPLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI || ''

export const APPLE_JS_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'

interface AppleAuthResponse {
  authorization?: { id_token?: string; code?: string; state?: string }
  user?: { name?: { firstName?: string; lastName?: string }; email?: string }
}

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (cfg: Record<string, unknown>) => void
        signIn: () => Promise<AppleAuthResponse>
      }
    }
  }
}

export interface AppleResult {
  id_token: string
  full_name?: string
}

/** Launch the Apple sign-in popup; returns the identity token (+ name on first consent). */
export async function signInWithApple(): Promise<AppleResult> {
  if (!APPLE_SERVICES_ID) throw new Error('Apple sign-in is not configured')
  if (typeof window === 'undefined' || !window.AppleID?.auth) {
    throw new Error('Apple sign-in is still loading — try again in a moment')
  }
  const redirectURI = APPLE_REDIRECT_URI || `${window.location.origin}/login`
  window.AppleID.auth.init({
    clientId: APPLE_SERVICES_ID,
    scope: 'name email',
    redirectURI,
    usePopup: true,
  })
  const resp = await window.AppleID.auth.signIn()
  const idToken = resp?.authorization?.id_token
  if (!idToken) throw new Error('Apple did not return a token')
  const n = resp?.user?.name
  const full_name = n ? [n.firstName, n.lastName].filter(Boolean).join(' ') || undefined : undefined
  return { id_token: idToken, full_name }
}
