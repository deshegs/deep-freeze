import { configProblem } from './lib/supabase'
import { useSession } from './lib/auth'
import { Login } from './screens/Login'
import { Shell } from './screens/Shell'

export function App() {
  if (configProblem) return <SetupNeeded problem={configProblem} />
  return <SignedInGate />
}

function SignedInGate() {
  const { session, loading } = useSession()

  if (loading) return <main className="centered" aria-busy="true" />
  return session ? <Shell email={session.user.email} /> : <Login />
}

function SetupNeeded({ problem }: { problem: string }) {
  return (
    <main className="centered">
      <div className="card">
        <h1>Almost ready</h1>
        <p>{problem}</p>
        <p className="muted">The README explains where to find these values.</p>
      </div>
    </main>
  )
}
