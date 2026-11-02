import { useCallback, useEffect, useRef, useState } from 'react'
import { USE_SOON_DAYS } from '../config'
import { errorText, failure } from './households'
import { isOffline, OFFLINE_MESSAGE, readCache, writeCache } from './offline'
import {
  newId,
  photoPath,
  preloadPhotos,
  removePhoto,
  uploadPhoto,
  type PhotoChange,
} from './photos'
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
  updated_at: string
  restored_from: string | null
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

export function withDeleted(item: Item, now = new Date()): Item {
  return { ...item, deleted_at: now.toISOString() }
}

export function withRestored(item: Item): Item {
  return { ...item, deleted_at: null }
}

// Applies a change from the server. Messages can arrive out of order, so one
// older than what's on screen is ignored.
export function withRemoteChange(items: Item[], row: Item) {
  const current = items.find((item) => item.id === row.id)
  if (!current) return [...items, row]
  if (new Date(row.updated_at) < new Date(current.updated_at)) return items
  return items.map((item) => (item.id === row.id ? row : item))
}

export function relativeTime(iso: string, now = new Date()) {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`
  if (minutes < 24 * 60) return `${plural(Math.floor(minutes / 60), 'hour')} ago`
  const days = daysSince(iso, now)
  return days <= 1 ? 'yesterday' : `${plural(days, 'day')} ago`
}

export async function fetchLastChange(itemId: string) {
  const { data, error } = await supabase
    .from('item_events')
    .select('user_id, created_at')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw failure(error)
  if (!data) return null

  // Someone who has since left the household can no longer be looked up.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', data.user_id ?? '')
    .maybeSingle()
  return {
    name: (profile?.display_name as string | undefined) ?? 'someone',
    when: relativeTime(data.created_at as string),
  }
}

function requireConnection() {
  if (isOffline()) throw new Error(OFFLINE_MESSAGE)
}

// Photos go first: once a row is gone, nothing records where its photo was.
async function purgeExpired(householdId: string) {
  const { data: limits } = await supabase.from('app_limits').select('deleted_item_days').single()
  if (!limits) return
  const cutoff = new Date(Date.now() - limits.deleted_item_days * DAY_MS).toISOString()

  const { data: expired } = await supabase
    .from('items')
    .select('photo_path')
    .eq('household_id', householdId)
    .lt('deleted_at', cutoff)
  if (!expired?.length) return

  await Promise.all(expired.flatMap((item) => item.photo_path ?? []).map(removePhoto))
  await supabase.rpc('purge_deleted_items', { target: householdId })
}

export function useItems(householdId: string) {
  const cacheKey = `items:${householdId}`
  const [items, setItems] = useState<Item[]>(() => readCache(cacheKey) ?? [])
  const [loading, setLoading] = useState(() => !readCache(cacheKey))
  const [error, setError] = useState<string | null>(null)
  const sending = useRef(new Map<string, number>())

  // Reports whether the server answered, for callers that must undo a change.
  const reload = useCallback(async () => {
    setError(null)
    const { data, error: problem } = await supabase
      .from('items')
      .select('*')
      .eq('household_id', householdId)
      .is('deleted_at', null)
    if (problem) {
      // With a saved list, keep showing it rather than an error.
      if (!readCache(cacheKey)) setError(errorText(failure(problem)))
    } else {
      const list = data as Item[]
      await preloadPhotos(list.flatMap((item) => item.photo_path ?? []))
      setItems(list)
      writeCache(cacheKey, list)
    }
    setLoading(false)
    return !problem
  }, [householdId, cacheKey])

  useEffect(() => {
    reload()
    window.addEventListener('online', reload)
    return () => window.removeEventListener('online', reload)
  }, [reload])

  useEffect(() => {
    if (!loading) writeCache(cacheKey, items)
  }, [items, loading, cacheKey])

  useEffect(() => {
    // Shows saved photos straight away, without waiting for reload to finish.
    const saved = readCache<Item[]>(cacheKey) ?? []
    preloadPhotos(saved.flatMap((item) => item.photo_path ?? [])).catch(() => {})
  }, [cacheKey])

  useEffect(() => {
    // Housekeeping: anything that fails is simply tried again next time.
    purgeExpired(householdId).catch(() => {})
  }, [householdId])

  useEffect(() => {
    let connectedBefore = false
    const channel = supabase
      .channel(`items:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items',
          filter: `household_id=eq.${householdId}`,
        },
        (change) => {
          // Hard deletes only remove items that were already hidden.
          if (change.eventType === 'DELETE') return
          const row = change.new as Item
          // While this phone is still sending, its own screen is the most
          // current, and the final message will bring it into line.
          if (sending.current.get(row.id)) return
          setItems((current) => withRemoteChange(current, row))
        },
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        // Anything sent while the connection was down was missed.
        if (connectedBefore) reload()
        connectedBefore = true
      })

    // Phones suspend the app in the background, so catch up on returning.
    function catchUp() {
      if (document.visibilityState === 'visible') reload()
    }
    document.addEventListener('visibilitychange', catchUp)

    return () => {
      document.removeEventListener('visibilitychange', catchUp)
      supabase.removeChannel(channel)
    }
  }, [householdId, reload])

  function replace(id: string, change: (item: Item) => Item) {
    setItems((current) => current.map((item) => (item.id === id ? change(item) : item)))
  }

  // Tapping must feel instant, so the screen changes first. If the server
  // refuses, the list reloads and the caller shows the reason.
  async function send(
    id: string,
    change: (item: Item) => Item,
    request: () => PromiseLike<{ error: { code?: string; message: string } | null }>,
  ) {
    requireConnection()
    const before = items
    replace(id, change)
    sending.current.set(id, (sending.current.get(id) ?? 0) + 1)
    const { error: problem } = await request()
    sending.current.set(id, (sending.current.get(id) ?? 1) - 1)
    if (problem) {
      // Without a connection the list can't reload, so step back by hand.
      if (!(await reload())) setItems(before)
      throw failure(problem)
    }
  }

  async function adjust(id: string, change: number) {
    await send(
      id,
      (item) => withQuantityChange(item, change),
      () => supabase.rpc('adjust_quantity', { item_id: id, change }),
    )
  }

  async function restock(id: string) {
    const now = new Date()
    await send(
      id,
      (item) => withRestock(item, now),
      () => supabase.from('items').update({ quantity: 1, added_at: now.toISOString() }).eq('id', id),
    )
  }

  async function softDelete(id: string) {
    const now = new Date()
    await send(
      id,
      (item) => withDeleted(item, now),
      () => supabase.from('items').update({ deleted_at: now.toISOString() }).eq('id', id),
    )
  }

  async function restore(id: string) {
    await send(id, withRestored, () =>
      supabase.from('items').update({ deleted_at: null }).eq('id', id),
    )
  }

  async function add(fields: ItemFields, photo: PhotoChange) {
    requireConnection()
    const id = newId()
    const path = photo instanceof Blob ? photoPath(householdId, id) : null
    if (path) await uploadPhoto(path, photo as Blob)

    const { data, error: problem } = await supabase
      .from('items')
      .insert({ ...fields, id, household_id: householdId, photo_path: path })
      .select()
      .single()
    if (problem) {
      if (path) await removePhoto(path).catch(() => {})
      throw failure(problem)
    }
    setItems((current) => [...current, data as Item])
  }

  async function save(item: Item, fields: ItemFields, photo: PhotoChange) {
    requireConnection()
    const { quantity, ...details } = fields
    let photo_path = item.photo_path
    if (photo instanceof Blob) {
      photo_path = photoPath(householdId, item.id)
      await uploadPhoto(photo_path, photo)
    } else if (photo === 'remove') {
      photo_path = null
    }

    const { error: problem } = await supabase
      .from('items')
      .update({ ...details, photo_path })
      .eq('id', item.id)
    if (problem) throw failure(problem)
    replace(item.id, (current) => ({ ...current, ...details, photo_path }))

    // The item no longer points at the file, so a failure here only leaves a
    // stray file that nobody can see.
    if (photo === 'remove' && item.photo_path) await removePhoto(item.photo_path).catch(() => {})
    // Sent as a difference so a tap from another phone isn't overwritten.
    if (quantity !== item.quantity) await adjust(item.id, quantity - item.quantity)
  }

  return { items, loading, error, reload, adjust, restock, add, save, softDelete, restore }
}
