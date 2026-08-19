import type { CSSProperties } from 'react'

/**
 * Shared box + label placement for the pill actions on a host listing card
 * ("View", "Edit", and "Re-upload ownership document"). They sit in a row that
 * stretches every pill to the tallest one, so they only look aligned if they all
 * position their label identically:
 *  - inline-flex + centre/centre puts the label in the middle of the pill rather
 *    than pinning it to the top when a neighbour wraps onto a second line.
 *  - a 1px transparent border keeps the fill-only pills' content box the same
 *    size as the outlined ones, which under border-box sizing otherwise render
 *    their label 1px lower than their neighbour.
 *  - an explicit line-height + minHeight makes the pill height deterministic
 *    instead of depending on the font's `normal` line box.
 * Each button keeps its own colours; only the geometry is shared.
 */
export const CARD_ACTION_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  boxSizing: 'border-box',
  minHeight: 38,
  padding: '9px 12px',
  borderRadius: 999,
  border: '1px solid transparent',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  lineHeight: 1.3,
  textDecoration: 'none',
}
