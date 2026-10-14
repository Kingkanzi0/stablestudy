import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ToastContext = createContext(null)
let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback(
    (toast) => {
      const id = nextId++
      setToasts((t) => [...t.slice(-3), { id, tone: 'info', ...toast }])
      setTimeout(() => dismiss(id), toast.tone === 'error' ? 9000 : 6000)
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      success: (title, extra) => push({ tone: 'success', title, ...extra }),
      error: (title, extra) => push({ tone: 'error', title, ...extra }),
      info: (title, extra) => push({ tone: 'info', title, ...extra }),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <div>
              <strong>{t.title}</strong>
              {t.body && <p>{t.body}</p>}
              {t.href && (
                <a href={t.href} target="_blank" rel="noreferrer">
                  {t.linkLabel || 'View on explorer'}
                </a>
              )}
            </div>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
