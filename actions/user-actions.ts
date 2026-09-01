'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { Profile, Role } from '@/lib/types/database'

export async function listUsers(): Promise<(Profile & { role: Role })[]> {
  await assertModuleAccess('usuarios')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*, role:roles(*)')
    .order('nome')

  if (error) throw new Error(error.message)
  return (data ?? []) as (Profile & { role: Role })[]
}

export async function createUser(nome: string, email: string, roleId: string): Promise<Profile> {
  await assertModuleAccess('usuarios')
  const supabase = createAdminClient()

  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email)
  if (authError) throw new Error(authError.message)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({ id: authData.user.id, nome, email, role_id: roleId })
    .select()
    .single()

  if (profileError) throw new Error(profileError.message)
  return profile
}
