import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configProblem } from './lib/supabase'
import { useSession } from './lib/auth'
import { captureInviteFromUrl, clearPendingInvite, useHouseholds } from './lib/households'
import { JoinPrompt } from './screens/JoinPrompt'
import { Login } from './screens/Login'
import { Onboarding } from './screens/Onboarding'
import { Shell } from './screens/Shell'

export function App() {
  if (configProblem) return <SetupNeeded problem={configProblem} />
  return <SignedInGate />
}

function SignedInGate() {
  const { session, loading } = useSession()
  const [pendingInvite, setPendingInvite] = useState(captureInviteFromUrl)

  if (loading) return <main className="centered" aria-busy="true" />
  if (!session) return <Login />
  return (
    <HouseholdGate
      key={session.user.id}
      session={session}
      pendingInvite={pendingInvite}
      onInviteHandled={() => {
        clearPendingInvite()
        setPendingInvite(null)
      }}
    />
  )
}

function HouseholdGate({
  session,
  pendingInvite,
  onInviteHandled,
}: {
  session: Session
  pendingInvite: string | null
  onInviteHandled: () => void
}) {
  const { households, active, setActiveId, loading, error, reload } = useHouseholds(session.user.id)

  if (loading) return <main className="centered" aria-busy="true" />
  if (error) {
    return (
      <main className="centered">
        <div className="card">
          <p className="error" role="alert">{error}</p>
          <button className="primary" onClick={() => reload()}>Try again</button>
        </div>
      </main>
    )
  }

  if (pendingInvite) {
    return (
      <JoinPrompt
        code={pendingInvite}
        onDone={async (householdId) => {
          onInviteHandled()
          if (householdId) await reload(householdId)
        }}
      />
    )
  }

  if (!active) return <Onboarding onReady={reload} />

  return (
    <Shell
      userId={session.user.id}
      households={households}
      household={active}
      onSwitch={setActiveId}
      onChanged={reload}
    />
  )
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
