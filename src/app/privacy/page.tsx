import type { Metadata } from 'next'
import { CONTACT_EMAIL, CONTACT_EMAIL_HREF, CONTACT_PHONE_DISPLAY } from '@/lib/contact'

// Public privacy policy. The explore footer has always linked here (and the app
// stores require a reachable policy URL), but the route did not exist, so
// /en/privacy answered with the 404 page. Static and unauthenticated on purpose:
// Apple and Google fetch it without a session, and so do crawlers.
//
// The contents describe what the code actually does — the tables in
// src/lib/local/db.ts, the Instapay-only payment flow (no card gateway), the
// coarsened map coordinates in src/lib/geo.ts, and the absence of any analytics
// or advertising SDK. Keep it that way: if data handling changes, change this too.

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const LAST_UPDATED = '21 August 2026'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How QuickIn collects, uses, stores and protects your personal data — and how to access or delete it.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 10px', color: C.burgundy }}>{title}</h2>
      <div style={{ fontSize: 14.5, lineHeight: 1.75, color: C.ink }}>{children}</div>
    </section>
  )
}

const ul: React.CSSProperties = { margin: '8px 0 0', paddingInlineStart: 20, color: C.muted, lineHeight: 1.75 }

export default function PrivacyPolicyPage() {
  return (
    <main style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: FONT, padding: '40px 20px 64px' }}>
      <article
        style={{
          width: '100%',
          maxWidth: 780,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 24,
          border: '1px solid rgba(42,34,32,0.07)',
          boxShadow: '0 12px 40px rgba(42,34,32,0.10)',
          padding: '40px 34px 44px',
        }}
      >
        <img src="/logo.png" alt="QuickIn" style={{ height: 44, display: 'block', margin: '0 auto 20px' }} />
        <h1 style={{ fontSize: 26, textAlign: 'center', margin: '0 0 6px' }}>Privacy Policy</h1>
        <p style={{ fontSize: 13.5, color: C.muted, textAlign: 'center', margin: 0 }}>Last updated {LAST_UPDATED}</p>

        <p style={{ fontSize: 14.5, lineHeight: 1.75, marginTop: 26 }}>
          QuickIn (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the QuickIn website and mobile apps, a platform for
          booking boutique stays in Egypt. This policy explains what personal data we collect, why we
          collect it, who we share it with, and the control you have over it. It applies to the
          website and to the QuickIn iOS and Android apps.
        </p>

        <Section title="Information you give us">
          <ul style={ul}>
            <li><strong>Account:</strong> your name, email address, phone number and password. Passwords are stored only as a salted hash — never in readable form. If you sign in with Google or Apple we receive your name, email and profile picture from them; we never receive your password.</li>
            <li><strong>Email verification:</strong> a one-time code sent to your address, stored until it is used or expires.</li>
            <li><strong>Becoming a host:</strong> your full name, national ID number, phone, address and (optionally) company name, submitted with your host application for review by our team.</li>
            <li><strong>Identity verification:</strong> photographs of your identity document, where verification is required.</li>
            <li><strong>Listings:</strong> property photos, description, address and map location, plus the ownership document you upload to prove you may list the property.</li>
            <li><strong>Bookings and payment:</strong> stay dates, guest counts and prices. Payment is by Instapay bank transfer — <strong>we do not operate a card gateway and never receive or store your card details.</strong> We do store the transfer screenshot you upload as proof of payment, so the host can confirm it.</li>
            <li><strong>Payouts:</strong> if you host, the payout details you provide so we can pay you.</li>
            <li><strong>Messages:</strong> messages you exchange with hosts or guests through the app, and anything you send our support team.</li>
          </ul>
        </Section>

        <Section title="Information collected automatically">
          <ul style={ul}>
            <li><strong>Sign-in records:</strong> the time and device of sign-ins, kept to secure your account and detect suspicious access.</li>
            <li><strong>Device push token:</strong> if you allow notifications, an identifier from Firebase Cloud Messaging so we can deliver them.</li>
            <li><strong>Approximate location:</strong> only if you grant permission, to show stays near you and centre the map. Your location is not stored on our servers.</li>
            <li><strong>Essential cookies:</strong> a session cookie to keep you signed in and a cookie remembering your language. We do not use advertising or tracking cookies.</li>
          </ul>
          <p style={{ marginTop: 12, color: C.muted }}>
            <strong>We do not run analytics, advertising or third-party tracking software</strong> on the
            website or in the apps, and we do not sell your personal data.
          </p>
        </Section>

        <Section title="How we use your data">
          <ul style={ul}>
            <li>To create and secure your account, and to verify your email address.</li>
            <li>To take, confirm and manage bookings, and to show hosts who is staying.</li>
            <li>To review host applications, listings and ownership documents before publishing them.</li>
            <li>To verify identity where required, and to investigate reports, disputes and policy violations — including keeping the platform safe from fraud.</li>
            <li>To pass messages between guests and hosts, and to send booking updates by email or push notification.</li>
            <li>To meet our legal, tax and accounting obligations.</li>
          </ul>
        </Section>

        <Section title="What other people can see">
          <p style={{ margin: 0 }}>
            Your public profile shows your first name and profile picture. When you book, the host
            sees your first name and your stay details; when you host, guests see your name and the
            listing you offer. <strong>A listing&rsquo;s map pin is deliberately approximate</strong> — we
            round coordinates to roughly a one-kilometre grid so the marker sits in the neighbourhood
            rather than on the exact address. Your email address, phone number, national ID and
            identity documents are never shown to other users.
          </p>
        </Section>

        <Section title="Who we share it with">
          <p style={{ margin: '0 0 6px' }}>We share personal data only with the service providers that run the platform, and only as needed:</p>
          <ul style={ul}>
            <li><strong>Vercel</strong> — website and API hosting.</li>
            <li><strong>Neon</strong> — the managed PostgreSQL database where your data is stored.</li>
            <li><strong>Google Firebase Cloud Messaging</strong> — delivering push notifications.</li>
            <li><strong>Google Maps</strong> — displaying maps and location pins.</li>
            <li><strong>Google and Apple</strong> — only if you choose to sign in with them.</li>
            <li><strong>Our email provider</strong> — sending verification codes and booking notifications.</li>
          </ul>
          <p style={{ marginTop: 12, color: C.muted }}>
            We may also disclose data where the law requires it, or to protect the rights and safety
            of our users. We do not sell or rent your personal data to anyone.
          </p>
        </Section>

        <Section title="International transfers">
          <p style={{ margin: 0 }}>
            The providers above may process data on servers outside Egypt. Where that happens, we
            rely on those providers&rsquo; contractual data-protection commitments to keep your data
            protected to the standard described in this policy.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p style={{ margin: 0 }}>
            We keep your account data for as long as your account exists. Booking and payment records
            are kept for as long as required for tax, accounting and dispute-resolution purposes,
            even after you delete your account. Verification codes and expired sessions are removed
            automatically. Identity documents are retained only as long as needed for the verification
            they were submitted for, and to meet our legal obligations.
          </p>
        </Section>

        <Section title="Your rights and choices">
          <ul style={ul}>
            <li><strong>Access and correction</strong> — view and edit your profile in the app at any time.</li>
            <li><strong>Deletion</strong> — delete your account and its data from{' '}
              <a href="/delete-account" style={{ color: C.burgundy, fontWeight: 600 }}>quickin-eg.com/delete-account</a>,
              or in the app under Profile. Some records are retained where the law requires it.</li>
            <li><strong>Notifications</strong> — turn push notifications off in your device settings at any time.</li>
            <li><strong>Location</strong> — revoke location permission in your device settings; the app still works without it.</li>
            <li><strong>Complaints</strong> — contact us first, and you may also complain to your local data-protection authority.</li>
          </ul>
        </Section>

        <Section title="Security">
          <p style={{ margin: 0 }}>
            Traffic is encrypted in transit with HTTPS, passwords are stored as salted hashes, and
            access to identity documents and host applications is restricted to authorised staff,
            whose administrative actions are logged. No system is perfectly secure, so please use a
            strong, unique password and tell us immediately if you suspect someone else has access to
            your account.
          </p>
        </Section>

        <Section title="Children">
          <p style={{ margin: 0 }}>
            QuickIn is not intended for anyone under 18, and we do not knowingly collect data from
            children. If you believe a child has given us personal data, contact us and we will
            delete it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p style={{ margin: 0 }}>
            If we change how we handle personal data we will update this page and revise the date at
            the top. Significant changes will be announced in the app.
          </p>
        </Section>

        <Section title="Contact us">
          <p style={{ margin: 0 }}>
            Questions about this policy or your data:{' '}
            <a href={CONTACT_EMAIL_HREF} style={{ color: C.burgundy, fontWeight: 600 }}>{CONTACT_EMAIL}</a>
            {' '}· {CONTACT_PHONE_DISPLAY}
          </p>
        </Section>

        <p style={{ marginTop: 34, textAlign: 'center' }}>
          <a href="/" style={{ color: C.burgundy, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Return to QuickIn</a>
        </p>
      </article>
    </main>
  )
}
