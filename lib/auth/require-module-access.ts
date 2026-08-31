import { redirect } from 'next/navigation'
import { getCurrentProfile, type ProfileWithPermissions } from '@/lib/auth/get-current-profile'
import { hasModuleAccess } from '@/lib/auth/permissions'
import type { ModuleKey } from '@/lib/types/database'

export async function requireModuleAccess(moduleKey: ModuleKey): Promise<ProfileWithPermissions> {
  const result = await getCurrentProfile()

  if (!result) {
    redirect('/login')
  }

  if (!hasModuleAccess(result.permissions, moduleKey)) {
    redirect('/acesso-negado')
  }

  return result
}
