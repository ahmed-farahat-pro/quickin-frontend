import type { Metadata } from 'next'
import { CONTACT_EMAIL, CONTACT_EMAIL_HREF, CONTACT_PHONES } from '@/lib/contact'
import { SOCIAL_LINKS } from '@/lib/social'
import { ContactForm } from './contact-form'

// Public Contact Us page. The explore footer, the mobile menu and the Profile
// screens on iOS and Android have always linked to /contact, but the route did
// not exist. The copy is bilingual in place (English | Egyptian Arabic), the
// same text whichever locale prefix the visitor arrived on.

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export const metadata: Metadata = {
  title: 'Contact Us | تواصل معانا',
  description: 'Have a question? Reach Quick In by email, phone or social media, or send us a message.',
}

function Label({ en, ar }: { en: string; ar: string }) {
  return (
    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
      {en} <span style={{ opacity: 0.5 }}>|</span> <span dir="rtl" style={{ textTransform: 'none', letterSpacing: 0 }}>{ar}</span>
    </div>
  )
}

const link: React.CSSProperties = { color: C.burgundy, fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }

export default function ContactPage() {
  return (
    <main style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: FONT, padding: '40px 20px 64px' }}>
      <article
        style={{
          width: '100%',
          maxWidth: 680,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 24,
          border: '1px solid rgba(42,34,32,0.07)',
          boxShadow: '0 12px 40px rgba(42,34,32,0.10)',
          padding: '40px 30px 44px',
        }}
      >
        <a href="/" aria-label="Quick In home">
          <img src="/logo.png" alt="Quick In" style={{ height: 44, display: 'block', margin: '0 auto 20px' }} />
        </a>
        <h1 style={{ fontSize: 26, textAlign: 'center', margin: '0 0 8px' }}>
          Contact Us <span style={{ color: C.muted, fontWeight: 400 }}>|</span> <span dir="rtl">تواصل معانا</span>
        </h1>
        <p style={{ fontSize: 16, fontWeight: 600, textAlign: 'center', color: C.burgundy, margin: '0 0 10px' }}>
          We&rsquo;re here to help! <span style={{ opacity: 0.5 }}>|</span> <span dir="rtl">إحنا هنا علشان نساعدك!</span>
        </p>
        <p style={{ fontSize: 14.5, lineHeight: 1.7, textAlign: 'center', color: C.muted, margin: 0 }}>
          Have a question? We&rsquo;d love to hear from you.
          <br />
          <span dir="rtl">عندك سؤال أو محتاج مساعدة؟ إحنا معاك!</span>
        </p>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 14px', color: C.burgundy }}>
            Contact Information <span style={{ opacity: 0.5 }}>|</span> <span dir="rtl">بيانات التواصل</span>
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ background: C.cream, borderRadius: 16, padding: '14px 16px' }}>
              <Label en="Email" ar="البريد الإلكتروني" />
              <a href={CONTACT_EMAIL_HREF} style={link}>{CONTACT_EMAIL}</a>
            </div>
            <div style={{ background: C.cream, borderRadius: 16, padding: '14px 16px' }}>
              <Label en="Phone Number" ar="رقم الموبايل" />
              <div style={{ display: 'grid', gap: 4 }}>
                {CONTACT_PHONES.map((p) => (
                  <a key={p.href} href={p.href} dir="ltr" style={link}>{p.display}</a>
                ))}
              </div>
            </div>
            <div style={{ background: C.cream, borderRadius: 16, padding: '14px 16px' }}>
              <Label en="Social Media" ar="السوشيال ميديا" />
              <div style={{ display: 'grid', gap: 4 }}>
                {SOCIAL_LINKS.map((s) => (
                  <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer" style={link}>
                    {s.label}
                    {s.handle && <span style={{ color: C.muted, fontWeight: 400 }}> · {s.handle}</span>}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 14px', color: C.burgundy }}>
            Send Us a Message <span style={{ opacity: 0.5 }}>|</span> <span dir="rtl">ابعتلنا رسالتك</span>
          </h2>
          <ContactForm />
        </section>

        <p style={{ marginTop: 36, textAlign: 'center', fontSize: 14, color: C.muted }}>
          <strong style={{ color: C.burgundy }}>Quick In</strong> — Find it. Book it. Live it.
        </p>
      </article>
    </main>
  )
}
