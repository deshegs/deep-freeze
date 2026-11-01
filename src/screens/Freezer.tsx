import { useState } from 'react'
import { Tile } from '../components/Tile'
import { CATEGORIES } from '../config'
import { ALL, filterItems, USE_SOON, type Item } from '../lib/items'

const CHIPS = [ALL, ...CATEGORIES.map((category) => category.name), USE_SOON]

export function Freezer({
  items,
  onEdit,
  onAdjust,
}: {
  items: Item[]
  onEdit: (item: Item) => void
  onAdjust: (item: Item, change: number) => void
}) {
  const [search, setSearch] = useState('')
  const [chip, setChip] = useState(ALL)
  const shown = filterItems(items, search, chip)

  if (items.length === 0) {
    return (
      <main className="empty">
        <p className="empty-emoji" aria-hidden="true">🧊</p>
        <p>Your freezer is empty.</p>
        <p>Tap + to add the first thing in it.</p>
      </main>
    )
  }

  return (
    <main>
      <div className="filters">
        <input
          type="search"
          aria-label="Search the freezer"
          placeholder="Search name, location or notes"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="chips" role="group" aria-label="Filter by category">
          {CHIPS.map((name) => (
            <button
              key={name}
              className="chip"
              aria-pressed={chip === name}
              onClick={() => setChip(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <p>Nothing matches that.</p>
          <button
            className="secondary"
            onClick={() => {
              setSearch('')
              setChip(ALL)
            }}
          >
            Show everything
          </button>
        </div>
      ) : (
        <ul className="grid">
          {shown.map((item) => (
            <Tile
              key={item.id}
              item={item}
              onEdit={() => onEdit(item)}
              onAdjust={(change) => onAdjust(item, change)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
