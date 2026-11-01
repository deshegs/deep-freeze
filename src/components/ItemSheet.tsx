import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CATEGORIES, LOCATIONS } from '../config'
import { errorText } from '../lib/households'
import type { Item, ItemFields } from '../lib/items'
import { Stepper } from './Stepper'

// Keeps the sheet above the on-screen keyboard, which phones draw over the page.
function useKeyboardOffset() {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () =>
      setOffset(Math.max(window.innerHeight - viewport.height - viewport.offsetTop, 0))
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return offset
}

export function ItemSheet({
  item,
  onSave,
  onClose,
}: {
  item: Item | null
  onSave: (fields: ItemFields) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [quantity, setQuantity] = useState(item?.quantity ?? 1)
  const [category, setCategory] = useState(item?.category ?? 'Other')
  const [location, setLocation] = useState(item?.location ?? LOCATIONS[0])
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [nameMissing, setNameMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const keyboardOffset = useKeyboardOffset()

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) {
      setNameMissing(true)
      nameInput.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({
        name: cleanName,
        quantity,
        category,
        location,
        notes: notes.trim() || null,
      })
      onClose()
    } catch (problem) {
      setError(errorText(problem))
      setBusy(false)
    }
  }

  const title = item ? 'Edit item' : 'Add to the freezer'

  return (
    <div className="sheet-layer">
      <div className="sheet-backdrop" onClick={onClose} />
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ bottom: keyboardOffset, maxHeight: `calc(92dvh - ${keyboardOffset}px)` }}
        onSubmit={handleSubmit}
        noValidate
      >
        <header className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="sheet-body">
          <label htmlFor="item-name">Name</label>
          <input
            id="item-name"
            ref={nameInput}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setNameMissing(false)
            }}
            maxLength={120}
            aria-invalid={nameMissing}
            aria-describedby={nameMissing ? 'item-name-error' : undefined}
            autoFocus={!item}
          />
          {nameMissing && (
            <p className="error" id="item-name-error" role="alert">
              Add a name so everyone knows what it is.
            </p>
          )}

          <span className="field-label">Quantity</span>
          <Stepper
            value={quantity}
            label={name.trim() || 'this item'}
            min={item ? 0 : 1}
            onChange={(change) => setQuantity((current) => current + change)}
          />

          <label htmlFor="item-category">Category</label>
          <select
            id="item-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATEGORIES.map((option) => (
              <option key={option.name} value={option.name}>
                {option.emoji} {option.name}
              </option>
            ))}
          </select>

          <label htmlFor="item-location">Where in the freezer</label>
          <select
            id="item-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            {LOCATIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <label htmlFor="item-notes">Notes</label>
          <textarea
            id="item-notes"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <footer className="sheet-actions">
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>
            {item ? 'Save changes' : 'Add to freezer'}
          </button>
        </footer>
      </form>
    </div>
  )
}
