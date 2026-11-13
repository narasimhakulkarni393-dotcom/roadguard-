'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastContextValue {
  toast: (input: { tone?: ToastTone; title: string; description?: string }) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  const dismiss = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = React.useCallback<ToastContextValue['toast']>(
    ({ tone = 'info', title, description }) => {
      const id = Date.now() + Math.random()
      setItems((current) => [...current.slice(-3), { id, tone, title, description }])
      window.setTimeout(() => dismiss(id), 5200)
    },
    [dismiss]
  )

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className="app-toast-region pointer-events-none fixed bottom-4 right-4 z-200 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      'pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-3.5 shadow-float',
                      item.tone === 'success' && 'border-success/25',
                      item.tone === 'error' && 'border-critical/25',
                      item.tone === 'info' && 'border-line'
                    )}
                  >
                    {item.tone === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
                    {item.tone === 'error' && <AlertCircle className="mt-0.5 size-4 shrink-0 text-critical" />}
                    {item.tone === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-info" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-ink">{item.title}</p>
                      {item.description && (
                        <p className="mt-0.5 text-[11.5px] leading-relaxed text-secondary">{item.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => dismiss(item.id)}
                      className="rounded p-0.5 text-muted transition hover:text-ink"
                      aria-label="Dismiss notification"
                    >
                      <X className="size-3.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
