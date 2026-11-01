import { useState, type FormEvent } from 'react'
import {
  cleanCode,
  cleanEmail,
  isValidCode,
  isValidEmail,
  sendSignInEmail,
  verifyCode,
} from '../lib/auth'

export function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend(event: FormEvent) {
    event.preventDefault()
    const address = cleanEmail(email)
    if (!isValidEmail(address)) {
      setError('Enter your full email address, like sam@example.com.')
      return
    }
    setBusy(true)
    setError(null)
    const problem = await sendSignInEmail(address)
    setBusy(false)
    if (problem) setError(problem)
    else setCodeSent(true)
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault()
    if (!isValidCode(code)) {
      setError('Enter the code from your email.')
      return
    }
    setBusy(true)
    setError(null)
    const problem = await verifyCode(cleanEmail(email), code)
    setBusy(false)
    if (problem) setError(problem)
  }

  function startOver() {
    setCodeSent(false)
    setCode('')
    setError(null)
  }

  return (
    <main className="centered">
      <div className="card">
        <h1>Deep freeze</h1>
        {codeSent ? (
          <form onSubmit={handleVerify} noValidate>
            <p>
              We emailed <strong>{cleanEmail(email)}</strong>. Tap the link in the email, or
              type the code here.
            </p>
            <label htmlFor="code">Code from your email</label>
            <input
              id="code"
              value={code}
              onChange={(event) => setCode(cleanCode(event.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button type="button" className="quiet" onClick={startOver}>
              Use a different email
            </button>
          </form>
        ) : (
          <form onSubmit={handleSend} noValidate>
            <p>Know what's in your freezer. No password needed.</p>
            <label htmlFor="email">Your email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoCapitalize="none"
            />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
