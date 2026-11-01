export function Stepper({
  value,
  label,
  min = 0,
  onChange,
}: {
  value: number
  label: string
  min?: number
  onChange: (change: number) => void
}) {
  return (
    <div className="stepper" role="group" aria-label={`Quantity of ${label}`}>
      <button
        type="button"
        aria-label={`One less ${label}`}
        disabled={value <= min}
        onClick={() => onChange(-1)}
      >
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`One more ${label}`} onClick={() => onChange(1)}>
        +
      </button>
    </div>
  )
}
