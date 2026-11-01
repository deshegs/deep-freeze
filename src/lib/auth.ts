import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

// All sign-in code lives here, so adding Google later means adding one function.

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
  await supabase.auth.signOut()
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  return { session, loading }
}
