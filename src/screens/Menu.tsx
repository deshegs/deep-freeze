import { signOut } from '../lib/auth'
import type { Household } from '../lib/households'

export function Menu({
  households,
  activeId,
  yourName,
  onOpenName,
  onOpenShare,
  onSwitch,
  onOpenHousehold,
  onAddHousehold,
  onClose,
}: {
  households: Household[]
  activeId: string
  yourName: string
  onOpenName: () => void
  onOpenShare: () => void
  onSwitch: (householdId: string) => void
  onOpenHousehold: () => void
  onAddHousehold: () => void
  onClose: () => void
}) {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Menu</h1>
        <button className="icon-button" aria-label="Close menu" onClick={onClose}>✕</button>
      </header>

      <section>
        <h2>Your households</h2>
        <ul className="rows">
          {households.map((household) => (
            <li key={household.id}>
              <button
                className="row-button"
                aria-current={household.id === activeId ? 'true' : undefined}
                onClick={() => onSwitch(household.id)}
              >
                <span>{household.name}</span>
                {household.id === activeId && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
          <li>
            <button className="row-button" onClick={onAddHousehold}>
              Create or join another household
            </button>
          </li>
        </ul>
      </section>

      <section>
        <ul className="rows">
          <li>
            <button className="row-button" onClick={onOpenHousehold}>
              Invite people and manage household
            </button>
          </li>
          <li>
            <button className="row-button" onClick={onOpenShare}>
              Share, QR code and install
            </button>
          </li>
          <li>
            <button className="row-button" onClick={onOpenName}>
              <span>Your name</span>
              <span className="muted">{yourName}</span>
            </button>
          </li>
          <li>
            <button className="row-button" onClick={signOut}>Sign out</button>
          </li>
        </ul>
      </section>
    </div>
  )
}
