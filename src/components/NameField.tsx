import { MAX_NAME_LENGTH } from '../lib/profile'

export function NameField({
  value,
  onChange,
}: {
  value: string
  onChange: (name: string) => void
}) {
  return (
    <div className="name-field">
      <label htmlFor="your-name">Your name</label>
      <input
        id="your-name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="given-name"
      />
      <p className="muted">Shown to people in your households.</p>
    </div>
  )
}
