import { useCallback, useState } from 'react'
import { ItemSheet } from '../components/ItemSheet'
import { Toast, type ToastMessage } from '../components/Toast'
import { OUT_UNDO_MS } from '../config'
import { errorText, type Household } from '../lib/households'
import {
  inFreezer,
  isUseSoon,
  outOfFreezer,
  summary,
  useItems,
  type Item,
} from '../lib/items'
import { Freezer } from './Freezer'
import { HouseholdScreen } from './HouseholdScreen'
import { Menu } from './Menu'
import { Onboarding } from './Onboarding'
import { OutList } from './OutList'

type Tab = 'freezer' | 'out'
type Screen = 'main' | 'menu' | 'household' | 'another-household'
type Sheet = { item: Item | null } | null

const MESSAGE_MS = 3000

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
  onChanged: (householdId?: string) => Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('freezer')
  const [screen, setScreen] = useState<Screen>('main')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const { items, loading, error, reload, adjust, restock, add, save } = useItems(household.id)

  const hideToast = useCallback(() => setToast(null), [])

  function showToast(text: string, options: Partial<ToastMessage> = {}) {
    setToast({ id: Date.now(), text, ms: MESSAGE_MS, ...options })
  }

  // Taps never wait for the server, so failures arrive as a message afterwards.
  function attempt(action: Promise<void>) {
    action.catch((problem) => showToast(errorText(problem)))
  }

  function handleAdjust(item: Item, change: number) {
    attempt(adjust(item.id, change))
    if (item.quantity + change === 0) {
      showToast(`${item.name} moved to Out`, {
        ms: OUT_UNDO_MS,
        onUndo: () => attempt(adjust(item.id, 1)),
      })
    }
  }

  function handleBoughtMore(item: Item) {
    attempt(restock(item.id))
    showToast(`${item.name} is back in the freezer`)
  }

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
        onAddHousehold={() => setScreen('another-household')}
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

  if (screen === 'another-household') {
    return (
      <Onboarding
        onReady={async (householdId) => {
          setScreen('main')
          await onChanged(householdId)
        }}
        onCancel={() => setScreen('menu')}
      />
    )
  }

  const freezer = inFreezer(items)
  const out = outOfFreezer(items)

  return (
    <div className="shell">
      <header className="app-header">
        <div>
          <h1>Deep freeze</h1>
          <p className="muted">
            {loading ? 'Opening the freezer…' : summary(freezer.length, freezer.filter((item) => isUseSoon(item)).length)}
          </p>
          {households.length > 1 && <p className="muted">{household.name}</p>}
        </div>
        <button className="icon-button" aria-label="Open menu" onClick={() => setScreen('menu')}>
          ☰
        </button>
      </header>

      {error && (
        <div className="empty">
          <p className="error" role="alert">{error}</p>
          <button className="secondary" onClick={reload}>Try again</button>
        </div>
      )}

      {!error && !loading && tab === 'freezer' && (
        <Freezer
          items={freezer}
          onEdit={(item) => setSheet({ item })}
          onAdjust={handleAdjust}
        />
      )}

      {!error && !loading && tab === 'out' && (
        <OutList items={out} onBoughtMore={handleBoughtMore} />
      )}

      {toast && <Toast key={toast.id} toast={toast} onDone={hideToast} />}

      <nav className="bottom-nav" aria-label="Main">
        <button aria-current={tab === 'freezer' ? 'page' : undefined} onClick={() => setTab('freezer')}>
          Freezer
        </button>
        <button
          className="add-button"
          aria-label="Add to the freezer"
          onClick={() => setSheet({ item: null })}
        >
          +
        </button>
        <button aria-current={tab === 'out' ? 'page' : undefined} onClick={() => setTab('out')}>
          {out.length ? `Out (${out.length})` : 'Out'}
        </button>
      </nav>

      {sheet && (
        <ItemSheet
          key={sheet.item?.id ?? 'new'}
          item={sheet.item}
          onClose={() => setSheet(null)}
          onSave={async (fields, photo) => {
            if (sheet.item) {
              await save(sheet.item, fields, photo)
              if (fields.quantity === 0) showToast(`${fields.name} moved to Out`)
            } else {
              await add(fields, photo)
              setTab('freezer')
            }
          }}
        />
      )}
    </div>
  )
}
