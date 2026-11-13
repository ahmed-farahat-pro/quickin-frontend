import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { localizePathname } from '@/lib/i18n/pathname'
import { termsAr, termsEn, type Agreement, type Block } from './content'

// Public Terms and Conditions. The explore footer has always linked here, but —
// like /privacy before it — the route did not exist and answered with the 404
// page. Static and unauthenticated so the app stores and crawlers can read it.
//
// The legal text is only published in Arabic and English (the Arabic governs),
// so /ar/terms renders Arabic and every other locale renders English.

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }
const FONT_EN = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'
const FONT_AR = 'var(--font-noto-sans-arabic), ui-sans-serif, system-ui, sans-serif'

export async function generateMetadata(): Promise<Metadata> {
  const ar = (await getLocale()) === 'ar'
  return {
    title: ar ? termsAr.title : termsEn.title,
    description: ar
      ? 'شروط استخدام منصة كويك إن للمؤجرين والمستأجرين.'
      : 'The agreements governing how hosts and guests use the Quick In platform.',
  }
}

function BlockView({ block }: { block: Block }) {
  const p: React.CSSProperties = { margin: '0 0 10px' }
  if (typeof block === 'string') return <p style={p}>{block}</p>
  if ('list' in block) {
    return (
      <ul style={{ margin: '0 0 10px', padding: 0, listStyle: 'none', color: C.ink }}>
        {block.list.map((item) => (
          <li key={item} style={{ paddingInlineStart: 18, marginBottom: 4 }}>{item}</li>
        ))}
      </ul>
    )
  }
  return (
    <p style={{ ...p, display: 'flex', gap: 12 }}>
      <span style={{ flex: '0 0 auto', minWidth: 34, fontWeight: 600, color: C.burgundy }}>{block.n}</span>
      <span>{block.text}</span>
    </p>
  )
}

function AgreementView({ agreement }: { agreement: Agreement }) {
  return (
    <section id={agreement.id} style={{ marginTop: 44, scrollMarginTop: 24 }}>
      <div style={{ background: C.tan, borderRadius: 16, padding: '18px 20px' }}>
        <h2 style={{ fontSize: 22, margin: 0, color: C.burgundy }}>{agreement.title}</h2>
        <p style={{ fontSize: 14, margin: '4px 0 0', color: C.muted }}>{agreement.subtitle}</p>
      </div>
      {agreement.groups.map((group) => (
        <div key={group.heading}>
          <h3 style={{ fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, margin: '30px 0 0' }}>
            {group.heading}
          </h3>
          {group.articles.map((article) => (
            <article key={article.title} style={{ marginTop: 22 }}>
              <h4 style={{ fontSize: 16.5, margin: '0 0 8px', color: C.burgundy }}>{article.title}</h4>
              <div style={{ fontSize: 14.5, lineHeight: 1.75, color: C.ink }}>
                {article.body.map((block, i) => <BlockView key={i} block={block} />)}
              </div>
            </article>
          ))}
        </div>
      ))}
    </section>
  )
}

export default async function TermsPage() {
  const locale = await getLocale()
  const ar = locale === 'ar'
  const t = ar ? termsAr : termsEn
  const pill: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: 999,
    border: `1px solid ${C.burgundy}`,
    color: C.burgundy,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
  }

  return (
    <main
      dir={ar ? 'rtl' : 'ltr'}
      lang={ar ? 'ar' : 'en'}
      style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: ar ? FONT_AR : FONT_EN, padding: '40px 20px 64px' }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 820,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 24,
          border: '1px solid rgba(42,34,32,0.07)',
          boxShadow: '0 12px 40px rgba(42,34,32,0.10)',
          padding: '40px 34px 44px',
        }}
      >
        <img src="/logo.png" alt="Quick In" style={{ height: 44, display: 'block', margin: '0 auto 20px' }} />
        <h1 style={{ fontSize: 26, textAlign: 'center', margin: '0 0 6px' }}>{t.title}</h1>
        <p style={{ fontSize: 13.5, color: C.muted, textAlign: 'center', margin: 0 }}>
          {t.lastUpdatedLabel}: {t.lastUpdated}
        </p>
        <p style={{ textAlign: 'center', margin: '12px 0 0' }}>
          <a
            href={localizePathname('/terms', ar ? 'en' : 'ar')}
            lang={ar ? 'en' : 'ar'}
            style={{ color: C.burgundy, fontSize: 13.5, fontWeight: 600 }}
          >
            {ar ? 'English' : 'العربية'}
          </a>
        </p>

        {t.intro.map((para) => (
          <p key={para} style={{ fontSize: 14.5, lineHeight: 1.75, margin: '22px 0 0' }}>{para}</p>
        ))}

        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 26 }}>
          {t.agreements.map((a) => (
            <a key={a.id} href={`#${a.id}`} style={pill}>{a.title}</a>
          ))}
        </nav>

        {t.agreements.map((a) => <AgreementView key={a.id} agreement={a} />)}

        <p style={{ marginTop: 40, textAlign: 'center' }}>
          <a href="/" style={{ color: C.burgundy, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            {ar ? 'العودة إلى كويك إن' : 'Return to Quick In'}
          </a>
        </p>
      </div>
    </main>
  )
}
