import { useState } from 'react'
import { signOut } from '../lib/auth'

type Tab = 'freezer' | 'out'

// The empty frame of the app. Milestones 2 and 3 fill it in.
export function Shell({ email }: { email?: string }) {
  const [tab, setTab] = useState<Tab>('freezer')

  return (
    <div className="shell">
      <header className="app-header">
        <div>
          <h1>Deep freeze</h1>
          <p className="muted">Signed in as {email}</p>
        </div>
        <button className="quiet" onClick={signOut}>Sign out</button>
      </header>

      <main className="empty">
        <p>{tab === 'freezer' ? 'Your freezer is empty.' : 'Nothing has run out yet.'}</p>
      </main>

      <nav className="bottom-nav" aria-label="Main">
        <button aria-current={tab === 'freezer' ? 'page' : undefined} onClick={() => setTab('freezer')}>
          Freezer
        </button>
        <button className="add-button" aria-label="Add to the freezer" disabled>+</button>
        <button aria-current={tab === 'out' ? 'page' : undefined} onClick={() => setTab('out')}>
          Out
        </button>
      </nav>
    </div>
  )
}
