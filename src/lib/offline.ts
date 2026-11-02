import { useEffect, useState } from 'react'

// Freezers are often where signal isn't, so the last list is kept on the phone.
// This is only a copy: clearing it loses nothing, because the server has it all.

const PREFIX = 'deep-freeze:offline:'
export const PHOTO_CACHE = 'deep-freeze-photos'
export const OFFLINE_MESSAGE = "You're offline. Changes need a connection."

export function readCache<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(PREFIX + key)
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or blocked. The app still works online.
  }
}

// Runs at sign-out, so nothing stays on a phone someone else might use.
export async function clearOfflineData() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key))
    if ('caches' in window) await caches.delete(PHOTO_CACHE)
  } catch {
    // Blocked storage has nothing to clear.
  }
}

export function isOffline() {
  return !navigator.onLine
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
