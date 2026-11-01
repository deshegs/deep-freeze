import { useEffect } from 'react'

export type ToastMessage = {
  id: number
  text: string
  ms: number
  onUndo?: () => void
}

export function Toast({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, toast.ms)
    return () => clearTimeout(timer)
  }, [toast, onDone])

  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.onUndo && (
        <button
          onClick={() => {
            toast.onUndo?.()
            onDone()
          }}
        >
          Undo
        </button>
      )}
    </div>
  )
}
