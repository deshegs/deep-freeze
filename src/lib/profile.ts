import { useCallback, useEffect, useState } from 'react'
import { failure } from './households'
import { readCache, writeCache } from './offline'
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
  const cacheKey = `profile:${userId}`
  const [profile, setProfile] = useState<Profile | null>(() => readCache(cacheKey))

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, name_chosen')
      .eq('id', userId)
      .maybeSingle()
    if (!data) return
    const next = { name: data.display_name, chosen: data.name_chosen }
    writeCache(cacheKey, next)
    setProfile(next)
  }, [userId, cacheKey])

  useEffect(() => {
    reload()
  }, [reload])

  return { profile, reload }
}
