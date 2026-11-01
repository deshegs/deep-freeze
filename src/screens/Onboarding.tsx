import { useState, type FormEvent } from 'react'
import { signOut } from '../lib/auth'
import { createHousehold, errorText, joinHousehold, parseInviteCode } from '../lib/households'

export function Onboarding({ onReady }: { onReady: (householdId: string) => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setError(null)
    try {
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
        <h1>Welcome to Deep freeze</h1>
        {error && <p className="error" role="alert">{error}</p>}

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

        <button className="quiet" onClick={signOut}>Sign out</button>
      </div>
    </main>
  )
}
