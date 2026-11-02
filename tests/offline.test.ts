import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearOfflineData, readCache, writeCache } from '../src/lib/offline'

function fakeStorage() {
  const entries: Record<string, string> = {}
  const storage = {
    getItem: (key: string) => entries[key] ?? null,
    setItem: (key: string, value: string) => {
      entries[key] = value
    },
    removeItem: (key: string) => {
      delete entries[key]
    },
  }
  return new Proxy(storage, {
    ownKeys: () => Object.keys(entries),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  })
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
  vi.stubGlobal('window', {})
})

describe('saved copies', () => {
  it('returns what was saved', () => {
    writeCache('items:home', [{ id: 'peas' }])
    expect(readCache('items:home')).toEqual([{ id: 'peas' }])
  })

  it('returns nothing when nothing was saved', () => {
    expect(readCache('items:home')).toBeNull()
  })

  it('ignores a damaged copy instead of failing', () => {
    localStorage.setItem('deep-freeze:offline:items:home', '{not json')
    expect(readCache('items:home')).toBeNull()
  })

  it('carries on when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => writeCache('items:home', [])).not.toThrow()
    expect(readCache('items:home')).toBeNull()
  })

  it('sign-out clears saved data but leaves other settings', async () => {
    writeCache('items:home', [{ id: 'peas' }])
    localStorage.setItem('deep-freeze:last-household', 'home')
    await clearOfflineData()
    expect(readCache('items:home')).toBeNull()
    expect(localStorage.getItem('deep-freeze:last-household')).toBe('home')
  })
})
