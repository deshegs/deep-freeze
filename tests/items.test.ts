import { describe, expect, it } from 'vitest'
import {
  ageLabel,
  ALL,
  filterItems,
  inFreezer,
  isUseSoon,
  outOfFreezer,
  ranOutLabel,
  summary,
  USE_SOON,
  withQuantityChange,
  withRestock,
  type Item,
} from '../src/lib/items'

const now = new Date(2026, 5, 15, 12)

function daysAgo(days: number) {
  return new Date(2026, 5, 15 - days, 9).toISOString()
}

function makeItem(fields: Partial<Item>): Item {
  return {
    id: 'peas',
    household_id: 'home',
    name: 'Peas',
    quantity: 1,
    category: 'Veg & fruit',
    location: 'Top basket',
    notes: null,
    photo_path: null,
    added_at: daysAgo(1),
    out_at: null,
    deleted_at: null,
    ...fields,
  }
}

describe('age labels', () => {
  it.each([
    [0, 'Added today'],
    [1, 'In freezer 1 day'],
    [12, 'In freezer 12 days'],
    [14, 'In freezer 2 weeks'],
    [35, 'In freezer 5 weeks'],
    [60, 'In freezer 2 months'],
    [125, 'In freezer 4 months'],
  ])('%i days reads "%s"', (days, label) => {
    expect(ageLabel(daysAgo(days), now)).toBe(label)
  })

  it('counts last night as yesterday', () => {
    expect(ageLabel(new Date(2026, 5, 14, 23, 30).toISOString(), now)).toBe('In freezer 1 day')
  })

  it('reports how long ago something ran out', () => {
    expect(ranOutLabel(daysAgo(0), now)).toBe('Ran out today')
    expect(ranOutLabel(daysAgo(1), now)).toBe('Ran out 1 day ago')
    expect(ranOutLabel(daysAgo(3), now)).toBe('Ran out 3 days ago')
  })
})

describe('use soon', () => {
  it('starts after 90 days', () => {
    expect(isUseSoon(makeItem({ added_at: daysAgo(90) }), now)).toBe(false)
    expect(isUseSoon(makeItem({ added_at: daysAgo(91) }), now)).toBe(true)
  })
})

describe('sorting and sections', () => {
  const old = makeItem({ id: 'old', added_at: daysAgo(100) })
  const fresh = makeItem({ id: 'fresh', added_at: daysAgo(1) })
  const gone = makeItem({ id: 'gone', quantity: 0, out_at: daysAgo(1) })
  const goneEarlier = makeItem({ id: 'earlier', quantity: 0, out_at: daysAgo(5) })
  const deleted = makeItem({ id: 'deleted', deleted_at: daysAgo(0) })

  it('shows the oldest item first', () => {
    expect(inFreezer([fresh, old]).map((item) => item.id)).toEqual(['old', 'fresh'])
  })

  it('keeps used-up and deleted items out of the freezer', () => {
    expect(inFreezer([gone, deleted, fresh]).map((item) => item.id)).toEqual(['fresh'])
  })

  it('lists the most recently used-up items first on Out', () => {
    expect(outOfFreezer([goneEarlier, gone, fresh]).map((item) => item.id)).toEqual(['gone', 'earlier'])
  })
})

describe('search and filters', () => {
  const peas = makeItem({ id: 'peas' })
  const beef = makeItem({
    id: 'beef',
    name: 'Beef mince',
    category: 'Meat',
    location: 'Back corner',
    notes: 'For chilli',
    added_at: daysAgo(100),
  })

  function ids(search: string, chip: string) {
    return filterItems([peas, beef], search, chip, now).map((item) => item.id)
  }

  it('shows everything by default', () => {
    expect(ids('', ALL)).toEqual(['peas', 'beef'])
  })

  it('searches name, location and notes', () => {
    expect(ids('MINCE', ALL)).toEqual(['beef'])
    expect(ids('back corner', ALL)).toEqual(['beef'])
    expect(ids('chilli', ALL)).toEqual(['beef'])
    expect(ids('nothing like this', ALL)).toEqual([])
  })

  it('filters by category and by use soon', () => {
    expect(ids('', 'Veg & fruit')).toEqual(['peas'])
    expect(ids('', USE_SOON)).toEqual(['beef'])
  })
})

describe('moving to Out and back', () => {
  it('moves an item to Out at zero', () => {
    const item = withQuantityChange(makeItem({ quantity: 1 }), -1, now)
    expect(item.quantity).toBe(0)
    expect(item.out_at).toBe(now.toISOString())
  })

  it('never goes below zero', () => {
    expect(withQuantityChange(makeItem({ quantity: 0 }), -1, now).quantity).toBe(0)
  })

  it('undo brings it back with its original added date', () => {
    const start = makeItem({ quantity: 1 })
    const undone = withQuantityChange(withQuantityChange(start, -1, now), 1, now)
    expect(undone).toEqual(start)
  })

  it('bought more restarts the age', () => {
    const item = withRestock(makeItem({ quantity: 0, out_at: daysAgo(2) }), now)
    expect(item).toMatchObject({ quantity: 1, out_at: null, added_at: now.toISOString() })
  })
})

describe('summary line', () => {
  it('mentions use soon only when it applies', () => {
    expect(summary(12, 3)).toBe('12 items in the freezer, oldest first, 3 to use soon')
    expect(summary(1, 0)).toBe('1 item in the freezer, oldest first')
    expect(summary(0, 0)).toBe('Nothing in the freezer yet')
  })
})
