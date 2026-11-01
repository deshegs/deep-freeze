import { useEffect, useState } from 'react'
import { NameField } from '../components/NameField'
import { errorText, joinHousehold, previewInvite } from '../lib/households'
import { nameProblem, saveName, type Profile } from '../lib/profile'

// Asks first, so opening a link can never add someone to a household by itself.
export function JoinPrompt({
  code,
  profile,
  onDone,
}: {
  code: string
  profile: Profile | null
  onDone: (householdId: string | null) => void
}) {
  const [householdName, setHouseholdName] = useState<string | null>(null)
  const [yourName, setYourName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const askForName = profile ? !profile.chosen : false
  const nameValue = yourName ?? profile?.name ?? ''

  useEffect(() => {
    previewInvite(code).then(setHouseholdName, (problem) => setError(errorText(problem)))
  }, [code])

  async function handleJoin() {
    const problem = askForName ? nameProblem(nameValue) : null
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (askForName) await saveName(nameValue)
      onDone(await joinHousehold(code))
    } catch (failed) {
      setError(errorText(failed))
      setBusy(false)
    }
  }

  return (
    <main className="centered">
      <div className="card">
        <h1>Join a household</h1>
        {householdName && <p>You've been invited to <strong>{householdName}</strong>.</p>}
        {!householdName && !error && <p className="muted">Checking your invite…</p>}
        {householdName && askForName && <NameField value={nameValue} onChange={setYourName} />}
        {error && <p className="error" role="alert">{error}</p>}
        {householdName && (
          <button className="primary" onClick={handleJoin} disabled={busy}>
            {busy ? 'Joining…' : 'Join household'}
          </button>
        )}
        <button className="quiet" onClick={() => onDone(null)}>
          {householdName ? 'Not now' : 'Close'}
        </button>
      </div>
    </main>
  )
}
