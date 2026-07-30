// Shared boutique palette for the /ops admin panel. The ops pages are deliberately
// styled with inline CSS rather than shadcn/ui (the rest of the app's kit) so they
// stay self-contained; this module just stops the values being re-declared in every
// new file. Same hexes as the originals in (console)/page.tsx and payments/page.tsx.
export const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  green: '#2E7D5B',
  red: '#B3261E',
} as const

export const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'
export const SERIF = '"Playfair Display", Georgia, serif'

/** White rounded card, the panel surface used throughout /ops. */
export const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 22,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgba(42,34,32,0.16)',
  background: '#fff',
  color: COLORS.ink,
  fontSize: 15,
  fontFamily: FONT,
  outline: 'none',
}

export const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 18px',
  borderRadius: 14,
  border: 'none',
  background: COLORS.burgundy,
  color: COLORS.cream,
  fontSize: 15,
  fontWeight: 700,
  fontFamily: FONT,
  cursor: 'pointer',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: COLORS.ink,
  marginBottom: 6,
}
