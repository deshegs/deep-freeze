import { useEffect, useRef } from 'react'

export function PhotoViewer({
  src,
  name,
  onClose,
}: {
  src: string
  name: string
  onClose: () => void
}) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    return () => previous?.focus?.()
  }, [])

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`Photo of ${name}`} onClick={onClose}>
      <button
        ref={closeButton}
        type="button"
        className="icon-button"
        aria-label="Close photo"
        onClick={onClose}
      >
        ✕
      </button>
      <img src={src} alt={name} onClick={(event) => event.stopPropagation()} />
    </div>
  )
}
