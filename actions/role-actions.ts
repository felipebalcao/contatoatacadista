'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { ModuleKey, Role } from '@/lib/types/database'

export async function listRoles(): Promise<(Role & { permissions: ModuleKey[] })[]> {
  await assertModuleAccess('usuarios')
  const supabase = createAdminClient()
  const { data: roles } = await supabase.from('roles').select('*').order('nome')
  const { data: permissionRows } = await supabase.from('role_permissions').select('role_id, module_key')

  return (roles ?? []).map((role) => ({
    ...role,
    permissions: (permissionRows ?? [])
      .filter((p) => p.role_id === role.id)
      .map((p) => p.module_key as ModuleKey),
  }))
}

export async function createRole(nome: string, moduleKeys: ModuleKey[]): Promise<Role> {
  await assertModuleAccess('usuarios')
  const supabase = createAdminClient()
  const { data: role, error } = await supabase
    .from('roles')
    .insert({ nome, is_system: false, permissions_locked: false })
    .select()
    .single()

  if (error) throw new Error(error.message)

  if (moduleKeys.length > 0) {
    const { error: permissionsError } = await supabase
      .from('role_permissions')
      .insert(moduleKeys.map((module_key) => ({ role_id: role.id, module_key })))

    if (permissionsError) throw new Error(permissionsError.message)
  }

  return role
}

export async function updateRolePermissions(roleId: string, moduleKeys: ModuleKey[]): Promise<void> {
  await assertModuleAccess('usuarios')
  const supabase = createAdminClient()

  const { data: role } = await supabase.from('roles').select('permissions_locked').eq('id', roleId).single()
  if (role?.permissions_locked) {
    throw new Error('As permissões deste papel não podem ser alteradas.')
  }

  await supabase.from('role_permissions').delete().eq('role_id', roleId)

  if (moduleKeys.length > 0) {
    const { error: permissionsError } = await supabase
      .from('role_permissions')
      .insert(moduleKeys.map((module_key) => ({ role_id: roleId, module_key })))

    if (permissionsError) throw new Error(permissionsError.message)
  }
}

export async function deleteRole(roleId: string): Promise<void> {
  await assertModuleAccess('usuarios')
  const supabase = createAdminClient()

  const { data: role } = await supabase.from('roles').select('is_system').eq('id', roleId).single()
  if (role?.is_system) {
    throw new Error('Papéis do sistema não podem ser excluídos.')
  }

  const { error } = await supabase.from('roles').delete().eq('id', roleId)
  if (error) {
    throw new Error('Não é possível excluir: existem usuários vinculados a este papel.')
  }
}
