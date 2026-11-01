import { categoryOf } from '../config'
import { ageLabel, isUseSoon, type Item } from '../lib/items'
import { Stepper } from './Stepper'

export function Tile({
  item,
  onEdit,
  onAdjust,
}: {
  item: Item
  onEdit: () => void
  onAdjust: (change: number) => void
}) {
  const category = categoryOf(item.category)

  return (
    <li className="tile">
      <button
        className="tile-photo"
        style={{ background: category.color }}
        aria-label={`Edit ${item.name}`}
        onClick={onEdit}
      >
        <span aria-hidden="true">{category.emoji}</span>
        <span className="tape">{item.name}</span>
      </button>
      <p className={isUseSoon(item) ? 'age age-alert' : 'age'}>{ageLabel(item.added_at)}</p>
      <Stepper value={item.quantity} label={item.name} onChange={onAdjust} />
    </li>
  )
}
