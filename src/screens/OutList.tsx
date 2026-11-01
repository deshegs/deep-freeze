import { categoryOf } from '../config'
import { ranOutLabel, type Item } from '../lib/items'

export function OutList({
  items,
  onBoughtMore,
}: {
  items: Item[]
  onBoughtMore: (item: Item) => void
}) {
  if (items.length === 0) {
    return (
      <main className="empty">
        <p>Nothing has run out yet.</p>
        <p>Used-up items land here, so this doubles as your shopping list.</p>
      </main>
    )
  }

  return (
    <main className="out-list">
      <ul className="rows">
        {items.map((item) => (
          <li key={item.id} className="row">
            <span className="out-emoji" aria-hidden="true">{categoryOf(item.category).emoji}</span>
            <div className="row-text">
              <span>{item.name}</span>
              <span className="muted">{ranOutLabel(item.out_at)}</span>
            </div>
            <button className="secondary" onClick={() => onBoughtMore(item)}>Bought more</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
