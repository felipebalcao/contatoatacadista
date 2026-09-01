import { getCurrentProfile, type ProfileWithPermissions } from '@/lib/auth/get-current-profile'
import { hasModuleAccess } from '@/lib/auth/permissions'
import type { ModuleKey } from '@/lib/types/database'

export async function assertModuleAccess(moduleKey: ModuleKey): Promise<ProfileWithPermissions> {
  const result = await getCurrentProfile()

  if (!result) {
    throw new Error('Não autenticado.')
  }

  if (!hasModuleAccess(result.permissions, moduleKey)) {
    throw new Error('Acesso negado.')
  }

  return result
}
