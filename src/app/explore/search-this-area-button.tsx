'use client'

// The floating "Search this area" pill overlaid on the explore map. Shared by
// both the Leaflet and Google map implementations so they look identical. Purely
// presentational: the parent map reads its own viewport bounds on click and
// fires the refetch. Centered near the top of the map, above the map panes.
import { useLanguage } from '@/lib/i18n/language-provider'

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default function SearchThisAreaButton({
  onClick,
}: {
  onClick: () => void
}) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      className="qk-press"
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        // Above Leaflet/Google map panes (Leaflet popups sit ~700; controls ~800).
        zIndex: 1000,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 42,
        padding: '0 20px',
        borderRadius: 999,
        border: '1px solid rgba(42,34,32,0.10)',
        background: '#fff',
        color: '#5B0F16',
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 8px 22px rgba(42,34,32,0.22)',
        whiteSpace: 'nowrap',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#5B0F16"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      {t('filters.searchThisArea')}
    </button>
  )
}
