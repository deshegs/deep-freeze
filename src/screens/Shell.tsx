import { useState } from 'react'
import type { Household } from '../lib/households'
import { HouseholdScreen } from './HouseholdScreen'
import { Menu } from './Menu'

type Tab = 'freezer' | 'out'
type Screen = 'main' | 'menu' | 'household'

// The frame of the app. Milestone 3 fills in the freezer and out lists.
export function Shell({
  userId,
  households,
  household,
  onSwitch,
  onChanged,
}: {
  userId: string
  households: Household[]
  household: Household
  onSwitch: (householdId: string) => void
  onChanged: () => Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('freezer')
  const [screen, setScreen] = useState<Screen>('main')

  if (screen === 'menu') {
    return (
      <Menu
        households={households}
        activeId={household.id}
        onSwitch={(householdId) => {
          onSwitch(householdId)
          setScreen('main')
        }}
        onOpenHousehold={() => setScreen('household')}
        onClose={() => setScreen('main')}
      />
    )
  }

  if (screen === 'household') {
    return (
      <HouseholdScreen
        key={household.id}
        userId={userId}
        household={household}
        onChanged={onChanged}
        onClose={() => setScreen('menu')}
        onGone={async () => {
          setScreen('main')
          await onChanged()
        }}
      />
    )
  }

  return (
    <div className="shell">
      <header className="app-header">
        <div>
          <h1>Deep freeze</h1>
          <p className="muted">{household.name}</p>
        </div>
        <button className="icon-button" aria-label="Open menu" onClick={() => setScreen('menu')}>
          ☰
        </button>
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
