import { useState, type FormEvent } from 'react'
import { NameField } from '../components/NameField'
import { errorText } from '../lib/households'
import { nameProblem, saveName } from '../lib/profile'

export function NameScreen({
  name,
  onSaved,
  onClose,
}: {
  name: string
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problem = nameProblem(value)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveName(value)
      await onSaved()
      onClose()
    } catch (failed) {
      setError(errorText(failed))
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Your name</h1>
        <button className="icon-button" aria-label="Back to menu" onClick={onClose}>✕</button>
      </header>
      <form onSubmit={handleSubmit} noValidate>
        <NameField value={value} onChange={setValue} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>Save name</button>
      </form>
    </div>
  )
}
