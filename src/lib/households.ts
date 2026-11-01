import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Role = 'owner' | 'member'
export type Household = { id: string; name: string; role: Role }
export type Member = { userId: string; role: Role; name: string }
export type Invite = {
  id: string
  code: string
  expires_at: string
  max_uses: number
  use_count: number
  revoked_at: string | null
}

const LAST_HOUSEHOLD_KEY = 'deep-freeze:last-household'
const PENDING_INVITE_KEY = 'deep-freeze:pending-invite'

// Browser storage can be blocked or empty, and nothing here depends on it.
function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Not remembered, which is fine.
  }
}

function recall(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

// Household rules raise plain-language messages (code P0001), shown as written.
export function failure(error: { code?: string; message: string }) {
  return new Error(
    error.code === 'P0001'
      ? error.message
      : 'Something went wrong. Check your connection and try again.',
  )
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

// Accepts a bare code or a whole invite link.
export function parseInviteCode(input: string) {
  const text = input.trim()
  const fromLink = text.match(/\/join\/([^/?#\s]+)/)
  return (fromLink ? fromLink[1] : text).toLowerCase()
}

export function inviteLink(code: string, origin: string) {
  return `${origin}/join/${code}`
}

export function isInviteUsable(invite: Invite, now = new Date()) {
  return (
    !invite.revoked_at &&
    new Date(invite.expires_at) > now &&
    invite.use_count < invite.max_uses
  )
}

export function pickActiveHousehold(households: Household[], lastUsed: string | null) {
  return households.find((household) => household.id === lastUsed)?.id ?? households[0]?.id ?? null
}

// An invite link can open before sign-in, so the code waits here until then.
export function captureInviteFromUrl() {
  const match = window.location.pathname.match(/^\/join\/([^/]+)/)
  if (match) {
    remember(PENDING_INVITE_KEY, parseInviteCode(match[0]))
    window.history.replaceState(null, '', '/')
  }
  return recall(PENDING_INVITE_KEY)
}

export function clearPendingInvite() {
  remember(PENDING_INVITE_KEY, null)
}

export async function fetchHouseholds(userId: string) {
  const { data, error } = await supabase
    .from('household_members')
    .select('role, households(id, name)')
    .eq('user_id', userId)
  if (error) throw failure(error)

  const rows = data as unknown as { role: Role; households: { id: string; name: string } }[]
  return rows
    .map((row) => ({ ...row.households, role: row.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function createHousehold(name: string) {
  const { data, error } = await supabase.rpc('create_household', { household_name: name })
  if (error) throw failure(error)
  return data as string
}

export async function previewInvite(code: string) {
  const { data, error } = await supabase.rpc('preview_invite', { invite_code: code })
  if (error) throw failure(error)
  return data as string
}

export async function joinHousehold(code: string) {
  const { data, error } = await supabase.rpc('join_household', { invite_code: code })
  if (error) throw failure(error)
  return data as string
}

export async function fetchMembers(householdId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, role, joined_at, profiles(display_name)')
    .eq('household_id', householdId)
    .order('joined_at')
  if (error) throw failure(error)

  const rows = data as unknown as {
    user_id: string
    role: Role
    profiles: { display_name: string } | null
  }[]
  return rows.map((row) => ({
    userId: row.user_id,
    role: row.role,
    name: row.profiles?.display_name ?? 'Someone',
  }))
}

export async function fetchInvites(householdId: string) {
  const { data, error } = await supabase
    .from('household_invites')
    .select('id, code, expires_at, max_uses, use_count, revoked_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
  if (error) throw failure(error)
  return (data as Invite[]).filter((invite) => isInviteUsable(invite))
}

export async function createInvite(householdId: string) {
  const { error } = await supabase.rpc('create_invite', { target: householdId })
  if (error) throw failure(error)
}

export async function revokeInvite(inviteId: string) {
  const { error } = await supabase.rpc('revoke_invite', { invite_id: inviteId })
  if (error) throw failure(error)
}

export async function removeMember(householdId: string, userId: string) {
  const { error } = await supabase.rpc('remove_member', { target: householdId, member: userId })
  if (error) throw failure(error)
}

export async function leaveHousehold(householdId: string) {
  const { error } = await supabase.rpc('leave_household', { target: householdId })
  if (error) throw failure(error)
}

export async function renameHousehold(householdId: string, name: string) {
  const clean = name.trim()
  if (!clean) throw new Error('Give your household a name.')
  const { error } = await supabase.from('households').update({ name: clean }).eq('id', householdId)
  if (error) throw failure(error)
}

export async function deleteHousehold(householdId: string) {
  const photos = supabase.storage.from('item-photos')
  // Photos live outside the database, so removing the household can't reach them.
  while (true) {
    const { data, error } = await photos.list(householdId, { limit: 100 })
    if (error) throw failure(error)
    if (!data.length) break
    const removal = await photos.remove(data.map((file) => `${householdId}/${file.name}`))
    if (removal.error) throw failure(removal.error)
  }

  const { error } = await supabase.from('households').delete().eq('id', householdId)
  if (error) throw failure(error)
}

export function useHouseholds(userId: string) {
  const [households, setHouseholds] = useState<Household[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(
    async (preferredId?: string) => {
      setError(null)
      try {
        const list = await fetchHouseholds(userId)
        setHouseholds(list)
        setActiveId((current) =>
          pickActiveHousehold(list, preferredId ?? current ?? recall(LAST_HOUSEHOLD_KEY)),
        )
      } catch (problem) {
        setError(errorText(problem))
      } finally {
        setLoading(false)
      }
    },
    [userId],
  )

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (activeId) remember(LAST_HOUSEHOLD_KEY, activeId)
  }, [activeId])

  const active = households.find((household) => household.id === activeId) ?? null
  return { households, active, setActiveId, loading, error, reload }
}
