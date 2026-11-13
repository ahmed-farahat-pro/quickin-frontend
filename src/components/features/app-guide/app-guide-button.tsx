'use client'

// "App guide" entries — the header icon, the mobile-menu row and the /account
// row. Each one only dispatches GUIDE_EVENT; the page's <AppGuide> opens the
// chooser (replay the main tour / how to become a host).

import { CircleHelp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GUIDE_EVENT } from '@/lib/app-guide-core'
import type { GuideEventDetail } from './app-guide'

export function openAppGuide(detail: GuideEventDetail = { open: 'chooser' }) {
  window.dispatchEvent(new CustomEvent<GuideEventDetail>(GUIDE_EVENT, { detail }))
}

/** Round icon button for the desktop header. */
export function AppGuideIconButton() {
  const t = useTranslations('appGuide.entry')
  return (
    <button
      type="button"
      onClick={() => openAppGuide()}
      aria-label={t('title')}
      title={t('title')}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#2A2220] transition-colors hover:bg-black/5"
    >
      <CircleHelp className="h-5 w-5" />
    </button>
  )
}

/** A row in the mobile menu sheet. `onBeforeOpen` closes the sheet first, so the
 *  chooser never stacks on top of it. */
export function AppGuideMenuRow({ className, onBeforeOpen }: { className: string; onBeforeOpen: () => void }) {
  const t = useTranslations('appGuide.entry')
  return (
    <button
      type="button"
      onClick={() => {
        onBeforeOpen()
        // Wait until the sheet has unmounted (it hands focus back to its trigger
        // as it goes), otherwise that focus restore steals focus from the chooser.
        const started = Date.now()
        const waitForSheet = () => {
          const sheetOpen = document.querySelector('[role="dialog"]:not([data-app-guide] *)')
          if (sheetOpen && Date.now() - started < 1500) setTimeout(waitForSheet, 50)
          else setTimeout(() => openAppGuide(), 30)
        }
        setTimeout(waitForSheet, 50)
      }}
      className={`${className} w-full text-start`}
    >
      <CircleHelp className="h-[18px] w-[18px] shrink-0 text-[#5B0F16]" />
      {t('title')}
    </button>
  )
}

/** The /account row: title + "Replay the tour or learn how to host". */
export function AppGuideAccountRow() {
  const t = useTranslations('appGuide.entry')
  return (
    <button
      type="button"
      onClick={() => openAppGuide()}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        padding: '14px 16px',
        margin: '2px 0',
        borderRadius: 14,
        border: 'none',
        background: 'transparent',
        color: '#2A2220',
        fontFamily: 'inherit',
        textAlign: 'start',
        cursor: 'pointer',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{t('title')}</span>
        <span style={{ fontSize: 13, color: '#6B6055' }}>{t('subtitle')}</span>
      </span>
      <span aria-hidden style={{ color: '#6B6055', fontWeight: 700 }}>→</span>
    </button>
  )
}
