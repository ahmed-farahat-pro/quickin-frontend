'use client'

// Lightweight, app-wide toast system for QuickIn — there was no shared toast
// before this (the admin page rolled its own local one). A <ToastProvider>
// mounted near the root exposes useToast(); any client component can fire a
// transient message:
//
//   const toast = useToast()
//   toast.show('Added to wishlist')                 // neutral/success
//   toast.show(err, { kind: 'error' })              // error tone
//
// Toasts stack top-center (matching the rest of the boutique UI), auto-dismiss
// after a few seconds, and are dismissible. Fully RTL-safe (centered, logical
// spacing) and announced to assistive tech via role="status" / aria-live.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  ink: '#2A2220',
  green: '#0f5132',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

interface ToastContextValue {
  // Show a toast. Returns the id (rarely needed). Default kind is 'success'.
  show: (message: string, opts?: { kind?: ToastKind; duration?: number }) => number
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION = 3200

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  // Track timers so we can clear them on unmount / manual dismiss.
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (
      message: string,
      opts?: { kind?: ToastKind; duration?: number }
    ): number => {
      const id = ++idRef.current
      const kind = opts?.kind ?? 'success'
      setToasts((prev) => [...prev, { id, message, kind }])
      const duration = opts?.duration ?? DEFAULT_DURATION
      const timer = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
      return id
    },
    [dismiss]
  )

  // Clear any outstanding timers when the provider unmounts.
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearTimeout(t))
      map.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Toast stack — fixed, centered near the top, above everything. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          top: 18,
          left: 0,
          right: 0,
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem
  onDismiss: () => void
}) {
  const bg =
    toast.kind === 'success'
      ? COLORS.green
      : toast.kind === 'error'
      ? COLORS.burgundy
      : COLORS.ink
  return (
    <div
      role="status"
      className="qk-pop"
      style={{
        pointerEvents: 'auto',
        maxWidth: 'min(92vw, 460px)',
        background: bg,
        color: '#fff',
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.45,
        padding: '12px 16px',
        borderRadius: 14,
        boxShadow: '0 14px 34px rgba(42,34,32,0.28)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          appearance: 'none',
          border: 'none',
          background: 'transparent',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 18,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
          flex: '0 0 auto',
          marginTop: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}

// Access the toast API. Safe no-op fallback if a caller is ever rendered outside
// the provider (keeps a stray component from crashing).
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (ctx) return ctx
  return { show: () => -1 }
}
