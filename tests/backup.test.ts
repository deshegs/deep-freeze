import { describe, expect, it } from 'vitest'
import { backupFileName, buildBackup, parseBackup, toCsv } from '../src/lib/backup'
import type { Item } from '../src/lib/items'

const now = new Date('2026-06-15T12:00:00Z')

const peas: Item = {
  id: '11111111-1111-4111-8111-111111111111',
  household_id: 'home',
  name: 'Peas',
  quantity: 2,
  category: 'Veg & fruit',
  location: 'Top basket',
  notes: null,
  photo_path: 'home/peas.jpg',
  added_at: '2026-01-02T09:00:00.000Z',
  out_at: null,
  deleted_at: null,
  updated_at: '2026-01-02T09:00:00.000Z',
  restored_from: null,
}

function backupText(items: Item[] = [peas]) {
  return JSON.stringify(buildBackup('Home', items, now))
}

describe('JSON backups', () => {
  it('round-trips every field a restore needs', () => {
    const backup = parseBackup(backupText())
    expect(backup.household).toBe('Home')
    expect(backup.exportedAt).toBe(now.toISOString())
    expect(backup.items).toEqual([
      {
        id: peas.id,
        name: 'Peas',
        quantity: 2,
        category: 'Veg & fruit',
        location: 'Top basket',
        notes: null,
        photo_path: 'home/peas.jpg',
        added_at: peas.added_at,
        out_at: null,
        restored_from: null,
      },
    ])
  })

  it('keeps used-up items', () => {
    const used = { ...peas, quantity: 0, out_at: '2026-02-01T00:00:00.000Z' }
    expect(parseBackup(backupText([used])).items[0]).toMatchObject({ quantity: 0, out_at: used.out_at })
  })

  it('keeps the original id through a second restore', () => {
    const restored = { ...peas, restored_from: '22222222-2222-4222-8222-222222222222' }
    expect(parseBackup(backupText([restored])).items[0].restored_from).toBe(restored.restored_from)
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(/isn't a Deep freeze backup/)
    expect(() => parseBackup('{"items":[]}')).toThrow(/isn't a Deep freeze backup/)
    expect(() => parseBackup('null')).toThrow(/isn't a Deep freeze backup/)
  })

  it('rejects a newer version', () => {
    expect(() => parseBackup('{"app":"deep-freeze","version":99,"items":[]}')).toThrow(/different version/)
  })

  it('rejects damaged items, restoring none of them', () => {
    const damaged = { ...peas, quantity: -1 }
    expect(() => parseBackup(backupText([peas, damaged]))).toThrow(/damaged/)
    expect(() => parseBackup(backupText([{ ...peas, id: 'nope' }]))).toThrow(/damaged/)
    expect(() => parseBackup(backupText([{ ...peas, name: '' }]))).toThrow(/damaged/)
    expect(() => parseBackup(backupText([{ ...peas, added_at: 'soon' }]))).toThrow(/damaged/)
  })
})

describe('CSV export', () => {
  it('has a readable header and rows', () => {
    const [header, row] = toCsv([peas]).split('\r\n')
    expect(header).toBe('Name,Quantity,Category,Location,Notes,Added,Ran out')
    expect(row).toBe('Peas,2,Veg & fruit,Top basket,,2026-01-02,')
  })

  it('quotes commas, quotes and line breaks', () => {
    const csv = toCsv([{ ...peas, name: 'Peas, "garden"', notes: 'line one\nline two' }])
    expect(csv).toContain('"Peas, ""garden"""')
    expect(csv).toContain('"line one\nline two"')
  })

  it('stops text from running as a spreadsheet formula', () => {
    const csv = toCsv([{ ...peas, name: '=HYPERLINK("x")', notes: '@cmd' }])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain("'@cmd")
  })
})

describe('file names', () => {
  it('uses the household and date', () => {
    expect(backupFileName("The Smiths' freezer", 'json', now)).toBe(
      'deep-freeze-the-smiths-freezer-2026-06-15.json',
    )
  })

  it('still works for a name with no plain letters', () => {
    expect(backupFileName('🧊', 'csv', now)).toBe('deep-freeze-household-2026-06-15.csv')
  })
})
