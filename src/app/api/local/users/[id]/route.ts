import { NextResponse } from 'next/server'
import { getUserById, updateUserProfile, getVerification } from '@/lib/local/db'
import { getUserFromRequest } from '@/lib/local/auth'
import { isContactBlockedError } from '@/lib/local/contentguard'
import { checkName, nameProblemMessage, normalizeName } from '@/lib/local/name-policy'
import { avatarProblemMessage, checkAvatar, normalizeAvatarUrl } from '@/lib/local/avatar-core'
import { normalizePhone } from '@/lib/local/phone-core'
import {
  ageProblemMessage,
  bioProblemMessage,
  checkAge,
  checkBio,
  isBlankField,
  normalizeBio,
  parseAge,
} from '@/lib/local/profile-core'

export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getUserById(id)

    if (!user) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const verification = await getVerification(id)

    return NextResponse.json(
      {
        profile: {
          id: user.id,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
          bio: null,
          verification_status: verification.status,
        },
        listings: [],
        reviews: [],
      },
      { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('GET /api/local/users/[id] failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/local/users/:id { full_name?, avatar_url?, age?, phone?, bio? } → { ok: true }
// Auth required; a user may only edit their own profile.
//
// age / phone / bio are the fields the mobile apps have always had on Edit
// profile and the web never did — they are written to the same `users` columns
// the apps' `/api/local/profile` writes, so one person editing on the phone and
// on the site is editing one profile. Each is optional: sending `null` or an
// empty string CLEARS it, which is the only way a bio someone regrets can go
// away. `phone` is never returned by the public GET above.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await getUserFromRequest(req)
    if (!caller) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers: CORS })
    const { id } = await params
    if (caller.id !== id) {
      return NextResponse.json({ error: 'You can only edit your own profile' }, { status: 403, headers: CORS })
    }
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: CORS })
    const fields: {
      full_name?: string
      avatar_url?: string | null
      age?: number | null
      phone?: string | null
      bio?: string | null
    } = {}
    // Renaming is the same door signup is: a gate only signup enforces would let
    // a guest sign up as `Layla` and become `12345` a minute later. Stored in the
    // normalized form, so one name is one name in /ops.
    if (body.full_name !== undefined) {
      const name = normalizeName(body.full_name)
      const nameProblem = checkName(name)
      if (nameProblem) {
        // `field` so /account can put the reason under the name input the way it
        // does for age, phone and bio, rather than only in the form-wide notice.
        return NextResponse.json(
          { error: nameProblemMessage(nameProblem), field: 'full_name', nameProblem },
          { status: 400, headers: CORS }
        )
      }
      fields.full_name = name
    }
    // A profile photo is stored, not linked: only a base64 `data:` image gets in,
    // and null/'' clears it. What was here before was `String(body.avatar_url)`,
    // which took whatever arrived — a remote URL that every guest's browser would
    // then fetch off the host's listing page, an unbounded string in a column that
    // rides along with one, or the literal text `null` whenever a client meant
    // "remove my photo". See avatar-core.ts for why each of those is refused.
    if (body.avatar_url !== undefined) {
      const avatarProblem = checkAvatar(body.avatar_url)
      if (avatarProblem) {
        return NextResponse.json(
          { error: avatarProblemMessage(avatarProblem), avatarProblem },
          { status: 400, headers: CORS }
        )
      }
      fields.avatar_url = normalizeAvatarUrl(body.avatar_url)
    }

    // Age. Refused rather than coerced: `Number('3e2')` is 300, and an age
    // nobody is, silently stored, is worse than a form that pushes back.
    if (body.age !== undefined) {
      const ageProblem = checkAge(body.age)
      if (ageProblem) {
        return NextResponse.json(
          { error: ageProblemMessage(ageProblem), field: 'age', ageProblem },
          { status: 400, headers: CORS }
        )
      }
      fields.age = parseAge(body.age)
    }

    // Phone, through the same module the host application and the mobile API
    // use, so the same mobile typed as `+20 10…`, `0020 10…` or `010…` is one
    // number on the row rather than three ways of writing it.
    if (body.phone !== undefined) {
      if (isBlankField(body.phone)) {
        fields.phone = null
      } else {
        const phone = normalizePhone(body.phone)
        if (!phone) {
          return NextResponse.json(
            { error: 'Enter a valid phone number, like 010 1234 5678', field: 'phone' },
            { status: 400, headers: CORS }
          )
        }
        fields.phone = phone
      }
    }

    // Bio. Stored normalized, so what the length was judged on is what is kept.
    // The contact guard runs on it in updateUserProfile — see the note there.
    if (body.bio !== undefined) {
      const bioProblem = checkBio(body.bio)
      if (bioProblem) {
        return NextResponse.json(
          { error: bioProblemMessage(bioProblem), field: 'bio', bioProblem },
          { status: 400, headers: CORS }
        )
      }
      const bio = normalizeBio(body.bio)
      fields.bio = bio === '' ? null : bio
    }

    await updateUserProfile(id, fields)
    return NextResponse.json({ ok: true }, { headers: CORS })
  } catch (err) {
    // A display name carrying contact details is the user's input to fix, so it
    // answers 400 with the guard's wording rather than a generic failure.
    if (isContactBlockedError(err)) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400, headers: CORS })
    }
    console.error('PATCH /api/local/users/[id] failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500, headers: CORS })
  }
}
