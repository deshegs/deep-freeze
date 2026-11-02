import { useEffect, useState } from 'react'
import { deleteAccount, householdsLostWithAccount } from '../lib/account'
import { errorText, type Household } from '../lib/households'

const CONFIRM_WORD = 'delete'

export function PrivacyScreen({
  households,
  onOpenExport,
  onClose,
}: {
  households: Household[]
  onOpenExport: () => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [lost, setLost] = useState<Household[] | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!confirming) return
    householdsLostWithAccount(households).then(setLost, (problem) => setError(errorText(problem)))
  }, [confirming, households])

  async function handleDelete() {
    if (!lost) return
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(lost)
    } catch (problem) {
      setError(errorText(problem))
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Privacy and account</h1>
        <button className="icon-button" aria-label="Back to menu" onClick={onClose}>✕</button>
      </header>

      <section>
        <h2>What's stored</h2>
        <ul className="plain-list">
          <li>Your email address, used only to sign you in</li>
          <li>The name you chose</li>
          <li>Your household names and who belongs to them</li>
          <li>Items, notes and photos</li>
          <li>Who changed what, and when</li>
        </ul>
        <p>
          Only people in a household can see its items, photos and history. Your name is visible
          to them too, but your email address isn't.
        </p>
        <p>
          Your phone keeps a copy of the latest list and photos for offline use, removed when you
          sign out. Deleted items are kept for 30 days so they can be recovered, then removed for
          good.
        </p>
      </section>

      <section>
        <h2>Export your data</h2>
        <p className="muted">Save your household's items as a backup or spreadsheet.</p>
        <button className="secondary" onClick={onOpenExport}>Go to export and restore</button>
      </section>

      <section className="danger-zone">
        <h2>Delete your account</h2>
        {error && <p className="error" role="alert">{error}</p>}

        {!confirming && (
          <button className="destructive-quiet" onClick={() => setConfirming(true)}>
            Delete my account
          </button>
        )}

        {confirming && !lost && !error && <p className="muted">Checking your households…</p>}

        {confirming && lost && (
          <div className="confirm">
            <p>This removes your email, name and memberships, and can't be undone.</p>
            {lost.length > 0 ? (
              <>
                <p>
                  <strong>You're the only member of these, so they'll be deleted with all their
                  items and photos:</strong>
                </p>
                <ul className="plain-list">
                  {lost.map((household) => <li key={household.id}>{household.name}</li>)}
                </ul>
              </>
            ) : (
              <p>Your households will carry on for their other members.</p>
            )}
            {lost.length < households.length && lost.length > 0 && (
              <p>Your other households will carry on for their other members.</p>
            )}
            <label htmlFor="confirm-delete">Type "{CONFIRM_WORD}" to confirm</label>
            <input
              id="confirm-delete"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <button
              className="destructive"
              disabled={busy || typed.trim().toLowerCase() !== CONFIRM_WORD}
              onClick={handleDelete}
            >
              {busy ? 'Deleting…' : 'Yes, delete my account'}
            </button>
            <button
              className="quiet"
              onClick={() => {
                setConfirming(false)
                setTyped('')
              }}
            >
              Keep my account
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
