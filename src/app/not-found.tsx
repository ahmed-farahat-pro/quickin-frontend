// Root 404 — brand-styled, self-contained inline styles.

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily: FONT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <img
          src="/logo.png"
          alt="QuickIn"
          style={{ height: 46, width: 'auto', margin: '0 auto 28px', display: 'block' }}
        />
        <p
          style={{
            margin: 0,
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1,
            color: COLORS.gold,
          }}
        >
          404
        </p>
        <h1
          style={{
            margin: '12px 0 0',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(22px, 4.5vw, 30px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: COLORS.burgundy,
          }}
        >
          Page not found
        </h1>
        <p style={{ margin: '12px 0 28px', fontSize: 15, lineHeight: 1.6, color: COLORS.muted }}>
          The page you were looking for doesn&apos;t exist or has moved.
        </p>
        <a
          href="/explore"
          className="qk-press"
          style={{
            display: 'inline-block',
            fontFamily: FONT,
            fontSize: 15,
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
            textDecoration: 'none',
            borderRadius: 999,
            padding: '12px 30px',
            boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
          }}
        >
          Browse stays
        </a>
      </div>
    </main>
  )
}
