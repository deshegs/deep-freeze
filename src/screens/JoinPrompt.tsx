import { useEffect, useState } from 'react'
import { errorText, joinHousehold, previewInvite } from '../lib/households'

// Asks first, so opening a link can never add someone to a household by itself.
export function JoinPrompt({
  code,
  onDone,
}: {
  code: string
  onDone: (householdId: string | null) => void
}) {
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    previewInvite(code).then(setName, (problem) => setError(errorText(problem)))
  }, [code])

  async function handleJoin() {
    setBusy(true)
    setError(null)
    try {
      onDone(await joinHousehold(code))
    } catch (problem) {
      setError(errorText(problem))
      setBusy(false)
    }
  }

  return (
    <main className="centered">
      <div className="card">
        <h1>Join a household</h1>
        {name && <p>You've been invited to <strong>{name}</strong>.</p>}
        {!name && !error && <p className="muted">Checking your invite…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {name && (
          <button className="primary" onClick={handleJoin} disabled={busy}>
            {busy ? 'Joining…' : 'Join household'}
          </button>
        )}
        <button className="quiet" onClick={() => onDone(null)}>
          {error ? 'Close' : 'Not now'}
        </button>
      </div>
    </main>
  )
}
