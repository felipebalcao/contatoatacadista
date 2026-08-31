import { createClient } from '@/lib/supabase/server'
import type { ModuleKey, Profile, Role } from '@/lib/types/database'

export interface ProfileWithPermissions {
  profile: Profile
  role: Role
  permissions: ModuleKey[]
}

export async function getCurrentProfile(): Promise<ProfileWithPermissions | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, role:roles(*)')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  const { data: permissionRows } = await supabase
    .from('role_permissions')
    .select('module_key')
    .eq('role_id', profile.role_id)

  const { role, ...profileFields } = profile as Profile & { role: Role }

  return {
    profile: profileFields,
    role,
    permissions: (permissionRows ?? []).map((p) => p.module_key as ModuleKey),
  }
}
