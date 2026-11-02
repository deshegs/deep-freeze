import { useState } from 'react'
import { configProblem } from './lib/supabase'
import { useUserId } from './lib/auth'
import { captureInviteFromUrl, clearPendingInvite, useHouseholds } from './lib/households'
import { useProfile } from './lib/profile'
import { JoinPrompt } from './screens/JoinPrompt'
import { Login } from './screens/Login'
import { Onboarding } from './screens/Onboarding'
import { Shell } from './screens/Shell'

export function App() {
  if (configProblem) return <SetupNeeded problem={configProblem} />
  return <SignedInGate />
}

function SignedInGate() {
  const { userId, loading } = useUserId()
  const [pendingInvite, setPendingInvite] = useState(captureInviteFromUrl)

  if (loading) return <main className="centered" aria-busy="true" />
  if (!userId) return <Login />
  return (
    <HouseholdGate
      key={userId}
      userId={userId}
      pendingInvite={pendingInvite}
      onInviteHandled={() => {
        clearPendingInvite()
        setPendingInvite(null)
      }}
    />
  )
}

function HouseholdGate({
  userId,
  pendingInvite,
  onInviteHandled,
}: {
  userId: string
  pendingInvite: string | null
  onInviteHandled: () => void
}) {
  const { households, active, setActiveId, loading, error, reload } = useHouseholds(userId)
  const { profile, reload: reloadProfile } = useProfile(userId)

  async function reloadAll(householdId?: string) {
    await Promise.all([reload(householdId), reloadProfile()])
  }

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
        profile={profile}
        onDone={async (householdId) => {
          onInviteHandled()
          if (householdId) await reloadAll(householdId)
        }}
      />
    )
  }

  if (!active) return <Onboarding profile={profile} onReady={reloadAll} />

  return (
    <Shell
      key={active.id}
      userId={userId}
      households={households}
      household={active}
      profile={profile}
      onSwitch={setActiveId}
      onChanged={reloadAll}
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
