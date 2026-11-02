import { useState, type ChangeEvent } from 'react'
import {
  backupFileName,
  buildBackup,
  parseBackup,
  restoreItems,
  saveFile,
  toCsv,
  type Backup,
  type RestoreCounts,
} from '../lib/backup'
import { errorText, type Household } from '../lib/households'
import type { Item } from '../lib/items'

type Preview = { backup: Backup; counts: RestoreCounts }

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function BackupScreen({
  household,
  items,
  onRestored,
  onClose,
}: {
  household: Household
  items: Item[]
  onRestored: () => Promise<unknown>
  onClose: () => void
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function exportJson() {
    saveFile(
      backupFileName(household.name, 'json'),
      JSON.stringify(buildBackup(household.name, items), null, 2),
      'application/json',
    )
  }

  function exportCsv() {
    saveFile(backupFileName(household.name, 'csv'), toCsv(items), 'text/csv')
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    setDone(null)
    setPreview(null)
    try {
      const backup = parseBackup(await file.text())
      setPreview({ backup, counts: await restoreItems(household.id, backup.items, true) })
    } catch (problem) {
      setError(errorText(problem))
    } finally {
      setBusy(false)
    }
  }

  async function confirmRestore() {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const counts = await restoreItems(household.id, preview.backup.items, false)
      await onRestored()
      setPreview(null)
      setDone(`Restored ${plural(counts.added + counts.broughtBack, 'item')}.`)
    } catch (problem) {
      setError(errorText(problem))
    } finally {
      setBusy(false)
    }
  }

  const changes = preview ? preview.counts.added + preview.counts.broughtBack : 0

  return (
    <div className="page">
      <header className="page-header">
        <h1>Export and restore</h1>
        <button className="icon-button" aria-label="Back to menu" onClick={onClose}>✕</button>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {done && <p role="status">{done}</p>}

      <section>
        <h2>Export {household.name}</h2>
        <p className="muted">
          {plural(items.length, 'item')}, including anything on the Out list. Photos aren't included.
        </p>
        <button className="secondary" onClick={exportJson}>Save a backup (JSON)</button>
        <button className="secondary" onClick={exportCsv}>Save a spreadsheet (CSV)</button>
      </section>

      <section>
        <h2>Restore a backup</h2>
        <p className="muted">
          Adds items from a JSON backup to {household.name}. Restoring the same backup twice
          won't create duplicates. Items in a different household come back without their photos.
        </p>

        {preview ? (
          <div className="confirm">
            <p>
              Backup of <strong>{preview.backup.household}</strong>
              {preview.backup.exportedAt && ` from ${preview.backup.exportedAt.slice(0, 10)}`}:
            </p>
            <ul className="restore-counts">
              <li>{plural(preview.counts.added, 'item')} to add</li>
              {preview.counts.broughtBack > 0 && (
                <li>{plural(preview.counts.broughtBack, 'deleted item')} to bring back</li>
              )}
              <li>{preview.counts.skipped} already here, left as they are</li>
            </ul>
            <button className="primary" onClick={confirmRestore} disabled={busy || changes === 0}>
              {changes === 0 ? 'Nothing to restore' : `Restore ${plural(changes, 'item')}`}
            </button>
            <button className="quiet" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        ) : (
          <label className="file-button">
            {busy ? 'Reading backup…' : 'Choose a backup file'}
            <input type="file" accept=".json,application/json" onChange={handleFile} disabled={busy} />
          </label>
        )}
      </section>
    </div>
  )
}
