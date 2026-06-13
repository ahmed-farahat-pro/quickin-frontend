'use client'

// Localized site footer for the Explore page. Extracted into a client component
// so it can read the i18n context (the page itself stays a server component).
// All link hrefs are placeholders ("#") in this prototype — only the labels are
// translated.
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
}

export default function SiteFooter() {
  const { t } = useLanguage()

  return (
    <footer
      style={{
        background: 'linear-gradient(180deg,#5B0F16,#45070d)',
        color: COLORS.cream,
        padding: '48px 24px 32px',
      }}
    >
      <div
        className="qk-footer-grid"
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, 1fr)',
          gap: 32,
        }}
      >
        <div>
          <img
            src="/logo.png"
            alt="QuickIn"
            height={36}
            style={{
              height: 36,
              width: 'auto',
              display: 'block',
              marginBottom: 14,
              filter: 'brightness(0) invert(1)',
            }}
          />
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: 'rgba(246,241,230,0.78)',
              maxWidth: 280,
            }}
          >
            {t('footer.tagline')}
          </p>
        </div>

        <FooterColumn
          title={t('footer.support')}
          links={[
            t('footer.helpCenter'),
            t('footer.cancellationOptions'),
            t('footer.safetyInfo'),
          ]}
        />
        <FooterColumn
          title={t('footer.hosting')}
          links={[
            t('footer.becomeHost'),
            t('footer.hostResources'),
            t('footer.communityForum'),
          ]}
        />
        <FooterColumn
          title={t('footer.about')}
          links={[t('footer.ourStory'), t('footer.careers'), t('footer.press')]}
        />
      </div>

      <div
        style={{
          maxWidth: 1200,
          margin: '32px auto 0',
          paddingTop: 22,
          borderTop: '1px solid rgba(246,241,230,0.18)',
          fontSize: 13,
          color: 'rgba(246,241,230,0.7)',
        }}
      >
        {t('footer.copyright')}
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 14,
          fontWeight: 700,
          color: COLORS.cream,
        }}
      >
        {title}
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {links.map((link) => (
          <li key={link} style={{ marginBottom: 8 }}>
            <a
              href="#"
              style={{
                fontSize: 14,
                color: 'rgba(246,241,230,0.78)',
                textDecoration: 'none',
              }}
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
