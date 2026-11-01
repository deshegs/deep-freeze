import { useState, type FormEvent } from 'react'
import { NameField } from '../components/NameField'
import { signOut } from '../lib/auth'
import { createHousehold, errorText, joinHousehold, parseInviteCode } from '../lib/households'
import { nameProblem, saveName, type Profile } from '../lib/profile'

// Shown on first run, and from the menu (with onCancel) for an extra household.
export function Onboarding({
  profile,
  onReady,
  onCancel,
}: {
  profile: Profile | null
  onReady: (householdId: string) => void
  onCancel?: () => void
}) {
  const [yourName, setYourName] = useState<string | null>(null)
  const askForName = profile ? !profile.chosen : false
  const nameValue = yourName ?? profile?.name ?? ''
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<string>) {
    const problem = askForName ? nameProblem(nameValue) : null
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (askForName) await saveName(nameValue)
      onReady(await action())
    } catch (problem) {
      setError(errorText(problem))
      setBusy(false)
    }
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give your household a name, like "The Smiths\' freezer".')
      return
    }
    run(() => createHousehold(name))
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault()
    if (!code.trim()) {
      setError('Paste the invite code or link you were sent.')
      return
    }
    run(() => joinHousehold(parseInviteCode(code)))
  }

  return (
    <main className="centered">
      <div className="card">
        <h1>{onCancel ? 'Another household' : 'Welcome to Deep freeze'}</h1>
        {error && <p className="error" role="alert">{error}</p>}
        {askForName && <NameField value={nameValue} onChange={setYourName} />}

        <form onSubmit={handleCreate} noValidate>
          <h2>Create your household</h2>
          <label htmlFor="household-name">Household name</label>
          <input
            id="household-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="The Smiths' freezer"
            maxLength={60}
          />
          <button className="primary" disabled={busy}>Create household</button>
        </form>

        <hr />

        <form onSubmit={handleJoin} noValidate>
          <h2>Join a household</h2>
          <label htmlFor="invite-code">Invite code or link</label>
          <input
            id="invite-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button className="secondary" disabled={busy}>Join household</button>
        </form>

        {onCancel ? (
          <button className="quiet" onClick={onCancel}>Back to menu</button>
        ) : (
          <button className="quiet" onClick={signOut}>Sign out</button>
        )}
      </div>
    </main>
  )
}
