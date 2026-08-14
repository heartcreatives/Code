import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type Tone = 'ok' | 'warn' | 'error'

interface ToastMessage {
  id: number
  text: string
  tone: Tone
}

const ToastContext = createContext<((text: string, tone?: Tone) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nextId = useRef(1)

  const show = useCallback((text: string, tone: Tone = 'ok') => {
    const id = nextId.current++
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }])
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(var(--nav-h) + 14px)' }}
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'pointer-events-auto w-full max-w-sm animate-toast-in rounded-2xl px-4 py-3',
              'text-[15px] font-semibold shadow-lift',
              t.tone === 'ok' ? 'bg-court-deep text-paper' : '',
              t.tone === 'warn' ? 'bg-[#7A5A12] text-paper' : '',
              t.tone === 'error' ? 'bg-spend text-white' : '',
            ].join(' ')}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
