import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createInvite,
  deleteHousehold,
  errorText,
  fetchInvites,
  fetchMembers,
  inviteLink,
  leaveHousehold,
  removeMember,
  renameHousehold,
  revokeInvite,
  type Household,
  type Invite,
  type Member,
} from '../lib/households'

type Confirming = 'leave' | 'delete' | null

export function HouseholdScreen({
  userId,
  household,
  onChanged,
  onClose,
  onGone,
}: {
  userId: string
  household: Household
  onChanged: () => Promise<void>
  onClose: () => void
  onGone: () => Promise<void>
}) {
  const isOwner = household.role === 'owner'
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [name, setName] = useState(household.name)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [nextMembers, nextInvites] = await Promise.all([
      fetchMembers(household.id),
      fetchInvites(household.id),
    ])
    setMembers(nextMembers)
    setInvites(nextInvites)
  }, [household.id])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (problem) {
      setError(errorText(problem))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load().catch((problem) => setError(errorText(problem)))
  }, [load])

  async function copy(invite: Invite) {
    const link = inviteLink(invite.code, window.location.origin)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(invite.id)
    } catch {
      setError(`Couldn't copy automatically. Here's the link: ${link}`)
    }
  }

  function handleRename(event: FormEvent) {
    event.preventDefault()
    run(async () => {
      await renameHousehold(household.id, name)
      await onChanged()
    })
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{household.name}</h1>
        <button className="icon-button" aria-label="Back to menu" onClick={onClose}>✕</button>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      <section>
        <h2>Invite people</h2>
        <p className="muted">
          Anyone with a link can join this household. Links last 7 days and work for a limited
          number of people.
        </p>
        <ul className="rows">
          {invites.map((invite) => (
            <li key={invite.id} className="row">
              <div className="row-text">
                <code>{invite.code}</code>
                <span className="muted">
                  Used {invite.use_count} of {invite.max_uses} times
                </span>
              </div>
              <button className="secondary" onClick={() => copy(invite)}>
                {copiedId === invite.id ? 'Copied' : 'Copy link'}
              </button>
              {isOwner && (
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await revokeInvite(invite.id)
                    await load()
                  })}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          className="primary"
          disabled={busy}
          onClick={() => run(async () => {
            await createInvite(household.id)
            await load()
          })}
        >
          Create invite link
        </button>
      </section>

      <section>
        <h2>Members</h2>
        <ul className="rows">
          {members.map((member) => (
            <li key={member.userId} className="row">
              <div className="row-text">
                <span>{member.userId === userId ? `${member.name} (you)` : member.name}</span>
                {member.role === 'owner' && <span className="muted">Owner</span>}
              </div>
              {isOwner && member.userId !== userId && (
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await removeMember(household.id, member.userId)
                    await load()
                  })}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isOwner && (
        <section>
          <h2>Rename household</h2>
          <form onSubmit={handleRename} noValidate>
            <label htmlFor="rename">Household name</label>
            <input
              id="rename"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
            />
            <button className="secondary" disabled={busy || name.trim() === household.name}>
              Save name
            </button>
          </form>
        </section>
      )}

      <section className="danger-zone">
        {confirming === 'leave' && (
          <div className="confirm">
            <p>Leave "{household.name}"? You'll need a new invite to come back.</p>
            <button
              className="destructive"
              disabled={busy}
              onClick={() => run(async () => {
                await leaveHousehold(household.id)
                await onGone()
              })}
            >
              Yes, leave
            </button>
            <button className="quiet" onClick={() => setConfirming(null)}>Stay</button>
          </div>
        )}

        {confirming === 'delete' && (
          <div className="confirm">
            <p>
              Delete "{household.name}"? This removes its items and photos for everyone, and
              can't be undone.
            </p>
            <button
              className="destructive"
              disabled={busy}
              onClick={() => run(async () => {
                await deleteHousehold(household.id)
                await onGone()
              })}
            >
              Yes, delete everything
            </button>
            <button className="quiet" onClick={() => setConfirming(null)}>Keep household</button>
          </div>
        )}

        {!confirming && (
          <>
            <button className="secondary" onClick={() => setConfirming('leave')}>
              Leave household
            </button>
            {isOwner && (
              <button className="destructive-quiet" onClick={() => setConfirming('delete')}>
                Delete household
              </button>
            )}
          </>
        )}
      </section>
    </div>
  )
}
