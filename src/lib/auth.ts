import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { clearOfflineData, isOffline, readCache, writeCache } from './offline'
import { supabase } from './supabase'

// All sign-in code lives here, so adding Google later means adding one function.

const LAST_USER_KEY = 'last-user'

export function cleanEmail(input: string) {
  return input.trim().toLowerCase()
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// People paste codes with spaces, and Supabase projects can use 6 to 10 digits.
export function cleanCode(input: string) {
  return input.replace(/\D/g, '')
}

export function isValidCode(code: string) {
  return code.length >= 6 && code.length <= 10
}

export function friendlyAuthError(message: string) {
  const text = message.toLowerCase()
  if (text.includes('rate limit') || text.includes('security purposes')) {
    return 'Too many sign-in emails in a short time. Wait a minute, then try again.'
  }
  if (text.includes('signups not allowed') || text.includes('signup is disabled')) {
    return "This is a private freezer. Ask its owner to add your email address."
  }
  if (text.includes('expired') || text.includes('invalid')) {
    return 'That code did not work or has expired. Check it, or send a new email.'
  }
  if (text.includes('fetch') || text.includes('network')) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return 'Something went wrong signing in. Try again in a moment.'
}

export async function sendSignInEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  return error ? friendlyAuthError(error.message) : null
}

// Installed iPhone apps don't share sign-ins with Safari, so the code typed
// here is what signs people in on the home-screen app.
export async function verifyCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  return error ? friendlyAuthError(error.message) : null
}

export async function signOut() {
  await clearOfflineData()
  await supabase.auth.signOut()
}

// Sign-ins expire hourly and renew over the network, so an expired one can't
// renew offline. The last user is remembered so the saved list still opens.
export function useUserId() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function apply(session: Session | null) {
      setUserId(session?.user.id ?? null)
      if (session) writeCache(LAST_USER_KEY, session.user.id)
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (data.session) apply(data.session)
      else if (error && isOffline()) setUserId(readCache<string>(LAST_USER_KEY))
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (next) apply(next)
      else if (event === 'SIGNED_OUT') apply(null)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return { userId, loading }
}
