export function PhotoViewer({
  src,
  name,
  onClose,
}: {
  src: string
  name: string
  onClose: () => void
}) {
  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`Photo of ${name}`} onClick={onClose}>
      <button type="button" className="icon-button" aria-label="Close photo" onClick={onClose}>
        ✕
      </button>
      <img src={src} alt={name} onClick={(event) => event.stopPropagation()} />
    </div>
  )
}
