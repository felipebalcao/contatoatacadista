'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { Profile, Role } from '@/lib/types/database'
import type { ResultadoAcao } from '@/lib/types/acao'

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

export async function createUser(nome: string, email: string, roleId: string): Promise<ResultadoAcao<Profile>> {
  await assertModuleAccess('usuarios')
  const supabase = createAdminClient()

  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email)
  if (authError) return { sucesso: false, erro: authError.message }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({ id: authData.user.id, nome, email, role_id: roleId })
    .select()
    .single()

  if (profileError) return { sucesso: false, erro: profileError.message }
  return { sucesso: true, dados: profile }
}
