import { useCallback, useEffect, useState } from 'react'
import { failure } from './households'
import { supabase } from './supabase'

export const MAX_NAME_LENGTH = 40

export type Profile = { name: string; chosen: boolean }

export function nameProblem(name: string) {
  const clean = name.trim()
  if (!clean) return 'Add your name so others know who changed what.'
  if (clean.length > MAX_NAME_LENGTH) return `Keep your name to ${MAX_NAME_LENGTH} characters.`
  return null
}

export async function saveName(name: string) {
  const { error } = await supabase.rpc('set_display_name', { new_name: name })
  if (error) throw failure(error)
}

export function useProfile(userId: string) {
  const [profile, setProfile] = useState<Profile | null>(null)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, name_chosen')
      .eq('id', userId)
      .maybeSingle()
    if (data) setProfile({ name: data.display_name, chosen: data.name_chosen })
  }, [userId])

  useEffect(() => {
    reload()
  }, [reload])

  return { profile, reload }
}
