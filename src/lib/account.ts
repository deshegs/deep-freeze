import { signOut } from './auth'
import { failure, fetchMembers, removeHouseholdPhotos, type Household } from './households'
import { supabase } from './supabase'

export async function householdsLostWithAccount(households: Household[]) {
  const memberLists = await Promise.all(households.map((household) => fetchMembers(household.id)))
  return households.filter((_, index) => memberLists[index].length === 1)
}

// Photos go first, while this account still has the right to remove them.
export async function deleteAccount(lost: Household[]) {
  await Promise.all(lost.map((household) => removeHouseholdPhotos(household.id)))
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw failure(error)
  // Clears this device. The sign-in itself no longer exists on the server.
  await signOut().catch(() => {})
}
