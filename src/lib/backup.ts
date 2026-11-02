import { failure } from './households'
import type { Item } from './items'
import { supabase } from './supabase'

const BACKUP_VERSION = 1
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BACKUP_FIELDS = [
  'id',
  'name',
  'quantity',
  'category',
  'location',
  'notes',
  'photo_path',
  'added_at',
  'out_at',
  'restored_from',
] as const

type BackupItem = Pick<Item, (typeof BACKUP_FIELDS)[number]>
export type Backup = { household: string; exportedAt: string; items: BackupItem[] }
export type RestoreCounts = { added: number; broughtBack: number; skipped: number }

export function buildBackup(household: string, items: Item[], now = new Date()) {
  return {
    app: 'deep-freeze',
    version: BACKUP_VERSION,
    household,
    exportedAt: now.toISOString(),
    items: items.map((item) =>
      Object.fromEntries(BACKUP_FIELDS.map((field) => [field, item[field]])),
    ),
  }
}

// A value starting with one of these runs as a formula in a spreadsheet,
// which matters because notes are typed by other people.
function csvCell(value: string | number | null) {
  const text = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(items: Item[]) {
  const rows = items.map((item) => [
    item.name,
    item.quantity,
    item.category,
    item.location,
    item.notes,
    item.added_at.slice(0, 10),
    item.out_at?.slice(0, 10) ?? '',
  ])
  return [['Name', 'Quantity', 'Category', 'Location', 'Notes', 'Added', 'Ran out'], ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')
}

export function backupFileName(household: string, extension: string, now = new Date()) {
  const slug = household.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `deep-freeze-${slug || 'household'}-${now.toISOString().slice(0, 10)}.${extension}`
}

function isBackupItem(entry: unknown): entry is BackupItem {
  const item = entry as BackupItem
  return (
    typeof item === 'object' &&
    item !== null &&
    UUID.test(String(item.id)) &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 0 &&
    !Number.isNaN(Date.parse(item.added_at)) &&
    (!item.restored_from || UUID.test(item.restored_from))
  )
}

export function parseBackup(text: string): Backup {
  const notABackup = "That isn't a Deep freeze backup. Choose a .json file exported from this app."
  let data: { app?: string; version?: number; household?: string; exportedAt?: string; items?: unknown[] }
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(notABackup)
  }

  if (data?.app !== 'deep-freeze' || !Array.isArray(data.items)) throw new Error(notABackup)
  if (data.version !== BACKUP_VERSION) {
    throw new Error('This backup came from a different version of Deep freeze and can\'t be read.')
  }
  if (!data.items.every(isBackupItem)) {
    throw new Error('This backup looks damaged, so nothing was restored.')
  }
  return {
    household: data.household ?? 'Unknown household',
    exportedAt: data.exportedAt ?? '',
    items: data.items as BackupItem[],
  }
}

export async function restoreItems(householdId: string, items: BackupItem[], dryRun: boolean) {
  const { data, error } = await supabase.rpc('restore_items', {
    target: householdId,
    rows: items,
    dry_run: dryRun,
  })
  if (error) throw failure(error)
  return data as RestoreCounts
}

// Downloads don't work inside an installed iPhone app, so there it goes
// through the share sheet, which offers Save to Files.
export async function saveFile(name: string, contents: string, type: string) {
  const file = new File([contents], name, { type })
  const installed = window.matchMedia('(display-mode: standalone)').matches
  if (installed && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => {})
    return
  }

  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
