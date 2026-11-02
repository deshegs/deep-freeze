import { useCallback, useState } from 'react'
import { ItemSheet } from '../components/ItemSheet'
import { Toast, type ToastMessage } from '../components/Toast'
import { DELETE_UNDO_MS, OUT_UNDO_MS } from '../config'
import { errorText, type Household } from '../lib/households'
import {
  inFreezer,
  isUseSoon,
  outOfFreezer,
  summary,
  useItems,
  type Item,
} from '../lib/items'
import { BackupScreen } from './BackupScreen'
import { Freezer } from './Freezer'
import { HouseholdScreen } from './HouseholdScreen'
import { isOffline, useOnline } from '../lib/offline'
import type { Profile } from '../lib/profile'
import { Menu } from './Menu'
import { NameScreen } from './NameScreen'
import { Onboarding } from './Onboarding'
import { OutList } from './OutList'
import { PrivacyScreen } from './PrivacyScreen'
import { ShareScreen } from './ShareScreen'

type Tab = 'freezer' | 'out'
type Screen =
  | 'main'
  | 'menu'
  | 'household'
  | 'another-household'
  | 'name'
  | 'share'
  | 'backup'
  | 'privacy'
type Sheet = { item: Item | null } | null

const MESSAGE_MS = 3000

export function Shell({
  userId,
  households,
  household,
  profile,
  onSwitch,
  onChanged,
}: {
  userId: string
  households: Household[]
  household: Household
  profile: Profile | null
  onSwitch: (householdId: string) => void
  onChanged: (householdId?: string) => Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('freezer')
  const [screen, setScreen] = useState<Screen>('main')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const { items, loading, error, reload, adjust, restock, add, save, softDelete, restore } =
    useItems(household.id)

  const online = useOnline()

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
    if (item.quantity + change === 0 && !isOffline()) {
      showToast(`${item.name} moved to Out`, {
        ms: OUT_UNDO_MS,
        onUndo: () => attempt(adjust(item.id, 1)),
      })
    }
  }

  function handleDelete(item: Item) {
    setSheet(null)
    attempt(softDelete(item.id))
    if (isOffline()) return
    showToast(`${item.name} deleted`, {
      ms: DELETE_UNDO_MS,
      onUndo: () => attempt(restore(item.id).then(() => showToast('Item restored'))),
    })
  }

  function handleBoughtMore(item: Item) {
    attempt(restock(item.id))
    if (!isOffline()) showToast(`${item.name} is back in the freezer`)
  }

  if (screen === 'menu') {
    return (
      <Menu
        households={households}
        activeId={household.id}
        yourName={profile?.name ?? ''}
        onOpenName={() => setScreen('name')}
        onOpenShare={() => setScreen('share')}
        onOpenBackup={() => setScreen('backup')}
        onOpenPrivacy={() => setScreen('privacy')}
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

  if (screen === 'backup') {
    return (
      <BackupScreen
        household={household}
        items={items.filter((item) => !item.deleted_at)}
        onRestored={reload}
        onClose={() => setScreen('menu')}
      />
    )
  }

  if (screen === 'privacy') {
    return (
      <PrivacyScreen
        households={households}
        onOpenExport={() => setScreen('backup')}
        onClose={() => setScreen('menu')}
      />
    )
  }

  if (screen === 'share') {
    return <ShareScreen onClose={() => setScreen('menu')} />
  }

  if (screen === 'name') {
    return (
      <NameScreen
        name={profile?.name ?? ''}
        onSaved={() => onChanged(household.id)}
        onClose={() => setScreen('menu')}
      />
    )
  }

  if (screen === 'another-household') {
    return (
      <Onboarding
        profile={profile}
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
      {/* inert keeps keyboards and screen readers inside the open sheet. */}
      <div inert={sheet !== null}>
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

      {!online && (
        <p className="offline-notice" role="status">
          Offline. Showing your last saved list.
        </p>
      )}

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
      </div>

      {sheet && (
        <ItemSheet
          key={sheet.item?.id ?? 'new'}
          item={sheet.item}
          onClose={() => setSheet(null)}
          onDelete={() => sheet.item && handleDelete(sheet.item)}
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
