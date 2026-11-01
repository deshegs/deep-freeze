import { useCallback, useEffect, useState } from 'react'
import { USE_SOON_DAYS } from '../config'
import { errorText, failure } from './households'
import { supabase } from './supabase'

export type Item = {
  id: string
  household_id: string
  name: string
  quantity: number
  category: string | null
  location: string | null
  notes: string | null
  photo_path: string | null
  added_at: string
  out_at: string | null
  deleted_at: string | null
}

export type ItemFields = Pick<Item, 'name' | 'quantity' | 'category' | 'location' | 'notes'>

export const ALL = 'All'
export const USE_SOON = 'Use soon'

const DAY_MS = 86_400_000

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// Counts calendar days, so something frozen last night reads as 1 day this morning.
export function daysSince(iso: string, now = new Date()) {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS)
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function ageLabel(addedAt: string, now = new Date()) {
  const days = daysSince(addedAt, now)
  if (days <= 0) return 'Added today'
  if (days < 14) return `In freezer ${plural(days, 'day')}`
  if (days < 60) return `In freezer ${plural(Math.floor(days / 7), 'week')}`
  return `In freezer ${plural(Math.floor(days / 30), 'month')}`
}

export function ranOutLabel(outAt: string | null, now = new Date()) {
  const days = outAt ? daysSince(outAt, now) : 0
  return days <= 0 ? 'Ran out today' : `Ran out ${plural(days, 'day')} ago`
}

export function isUseSoon(item: Pick<Item, 'added_at'>, now = new Date()) {
  return daysSince(item.added_at, now) > USE_SOON_DAYS
}

export function inFreezer(items: Item[]) {
  return items
    .filter((item) => item.quantity > 0 && !item.deleted_at)
    .sort((a, b) => a.added_at.localeCompare(b.added_at))
}

export function outOfFreezer(items: Item[]) {
  return items
    .filter((item) => item.quantity === 0 && !item.deleted_at)
    .sort((a, b) => (b.out_at ?? '').localeCompare(a.out_at ?? ''))
}

export function filterItems(items: Item[], search: string, chip: string, now = new Date()) {
  const words = search.trim().toLowerCase()
  return items.filter((item) => {
    if (chip === USE_SOON && !isUseSoon(item, now)) return false
    if (chip !== ALL && chip !== USE_SOON && item.category !== chip) return false
    if (!words) return true
    return [item.name, item.location, item.notes].some((text) =>
      text?.toLowerCase().includes(words),
    )
  })
}

export function summary(count: number, useSoonCount: number) {
  if (count === 0) return 'Nothing in the freezer yet'
  const items = `${plural(count, 'item')} in the freezer, oldest first`
  return useSoonCount ? `${items}, ${useSoonCount} to use soon` : items
}

// What a change does to an item, applied on screen before the server confirms it.
export function withQuantityChange(item: Item, change: number, now = new Date()): Item {
  const quantity = Math.max(item.quantity + change, 0)
  if (quantity > 0) return { ...item, quantity, out_at: null }
  return { ...item, quantity, out_at: item.out_at ?? now.toISOString() }
}

export function withRestock(item: Item, now = new Date()): Item {
  return { ...item, quantity: 1, added_at: now.toISOString(), out_at: null }
}

export function useItems(householdId: string) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    const { data, error: problem } = await supabase
      .from('items')
      .select('*')
      .eq('household_id', householdId)
      .is('deleted_at', null)
    if (problem) setError(errorText(failure(problem)))
    else setItems(data as Item[])
    setLoading(false)
  }, [householdId])

  useEffect(() => {
    reload()
  }, [reload])

  function replace(id: string, change: (item: Item) => Item) {
    setItems((current) => current.map((item) => (item.id === id ? change(item) : item)))
  }

  // Tapping must feel instant, so the screen changes first. If the server
  // refuses, the list reloads and the caller shows the reason.
  async function adjust(id: string, change: number) {
    replace(id, (item) => withQuantityChange(item, change))
    const { error: problem } = await supabase.rpc('adjust_quantity', { item_id: id, change })
    if (problem) {
      await reload()
      throw failure(problem)
    }
  }

  async function restock(id: string) {
    const now = new Date()
    replace(id, (item) => withRestock(item, now))
    const { error: problem } = await supabase
      .from('items')
      .update({ quantity: 1, added_at: now.toISOString() })
      .eq('id', id)
    if (problem) {
      await reload()
      throw failure(problem)
    }
  }

  async function add(fields: ItemFields) {
    const { data, error: problem } = await supabase
      .from('items')
      .insert({ ...fields, household_id: householdId })
      .select()
      .single()
    if (problem) throw failure(problem)
    setItems((current) => [...current, data as Item])
  }

  async function save(item: Item, fields: ItemFields) {
    const { quantity, ...details } = fields
    const { error: problem } = await supabase.from('items').update(details).eq('id', item.id)
    if (problem) throw failure(problem)
    replace(item.id, (current) => ({ ...current, ...details }))
    // Sent as a difference so a tap from another phone isn't overwritten.
    if (quantity !== item.quantity) await adjust(item.id, quantity - item.quantity)
  }

  return { items, loading, error, reload, adjust, restock, add, save }
}
