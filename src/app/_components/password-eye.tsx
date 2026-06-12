import type { CSSProperties } from 'react'

// Shared bits for the show/hide password toggle used on /login and /signup.
// The button sits absolutely inside a `position: relative` wrapper around the
// password <input>; give the input `paddingRight: 44` so text clears the icon.

export const eyeButtonStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  right: 12,
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#6B6055',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
}

export function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2 2 20 20" />
      <path d="M6.7 6.7C4 8.3 2 12 2 12s3.5 7 10 7c2 0 3.7-.5 5.1-1.3" />
      <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.9 3.8" />
      <path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}
