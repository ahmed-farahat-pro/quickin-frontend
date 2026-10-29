'use client'

// The one WhatsApp trigger the site uses. We have two WhatsApp lines, so a
// button can't link straight to a chat: it opens a small dialog listing both
// numbers from @/lib/contact, and picking one opens wa.me in a new tab.
//
// The trigger is a real <button> styled by the caller (`className` / `style`),
// with the caller's children as its content, so server components can wrap it
// around their own markup. Radix Dialog supplies the focus trap, Escape to
// close, focus return to the trigger and the dialog/title/description roles.
import { Dialog } from 'radix-ui'
import { XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { WHATSAPP_NUMBERS, whatsappHref } from '@/lib/contact'

export function WhatsAppGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M16.004 3C9.383 3 4 8.383 4 15.004c0 2.117.555 4.184 1.61 6.008L4 29l8.184-1.57a11.94 11.94 0 0 0 3.82.63C22.625 28.06 28 22.676 28 16.055 28 8.43 22.625 3 16.004 3zm5.46 14.44c-.3-.15-1.77-.873-2.043-.973-.273-.1-.473-.15-.673.15-.2.297-.772.97-.947 1.17-.173.198-.35.223-.648.075-.3-.15-1.263-.466-2.406-1.485-.888-.792-1.487-1.77-1.662-2.07-.173-.297-.018-.458.13-.606.134-.133.3-.347.448-.52.15-.174.2-.298.3-.497.099-.2.05-.372-.025-.52-.075-.15-.672-1.62-.922-2.22-.243-.583-.49-.504-.672-.513l-.573-.01c-.2 0-.522.074-.796.372-.273.297-1.045 1.02-1.045 2.49 0 1.47 1.07 2.89 1.22 3.09.15.198 2.105 3.213 5.1 4.505.714.308 1.27.492 1.704.63.716.228 1.368.196 1.883.12.574-.086 1.77-.723 2.02-1.42.248-.698.248-1.296.173-1.42-.074-.124-.273-.198-.573-.347z" />
    </svg>
  )
}

export default function WhatsAppPicker({
  message,
  className,
  style,
  'aria-label': ariaLabel,
  children,
}: {
  /** Pre-fills the chat on whichever number the guest picks. */
  message?: string
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
  children: React.ReactNode
}) {
  const t = useTranslations('contact')
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={ariaLabel}
          className={['cursor-pointer', className].filter(Boolean).join(' ')}
          style={style}
        >
          {children}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[1000] bg-black/50" />
        <Dialog.Content
          // Start on the first number rather than the close button, so a
          // keyboard user can open the picker and press Enter straight away.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).querySelector<HTMLElement>('a')?.focus()
          }}
          className={[
            'fixed left-1/2 top-1/2 z-[1001] w-[calc(100vw-32px)] max-w-[380px] -translate-x-1/2 -translate-y-1/2',
            'rounded-[20px] bg-white p-6 text-[#2A2220] shadow-[0_20px_60px_rgba(0,0,0,0.25)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'focus:outline-none',
          ].join(' ')}
        >
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
              <WhatsAppGlyph size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[17px] font-bold leading-tight">{t('whatsappPickerTitle')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-[13.5px] leading-snug text-[#6B6055]">
                {t('whatsappPickerBody')}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t('close')}
              className="-me-2 -mt-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6B6055] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B0F16]/40"
            >
              <XIcon className="h-[18px] w-[18px]" aria-hidden />
            </Dialog.Close>
          </div>
          <ul className="grid gap-2.5">
            {WHATSAPP_NUMBERS.map((n, i) => (
              <li key={n.e164}>
                {/* Closing on click too: the chat opens in a new tab, and the
                    guest coming back to this one shouldn't find the dialog. */}
                <Dialog.Close asChild>
                  <a
                    href={whatsappHref(n.e164, message)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[56px] items-center gap-3 rounded-[14px] border border-[#2A2220]/10 bg-[#F6F1E6] px-4 py-3 no-underline transition-colors hover:border-[#25D366] hover:bg-[#25D366]/10 focus-visible:border-[#25D366] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/50"
                  >
                    <span className="text-[#1DA851]">
                      <WhatsAppGlyph size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold uppercase tracking-wide text-[#6B6055]">
                        {t('whatsappLine', { n: i + 1 })}
                      </span>
                      {/* Inline <bdi> inside a block: the digits keep LTR order
                          but the line still aligns with the label in RTL. */}
                      <span className="block text-[16px] font-bold text-[#2A2220]">
                        <bdi dir="ltr">{n.display}</bdi>
                      </span>
                    </span>
                  </a>
                </Dialog.Close>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
