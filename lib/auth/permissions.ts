import type { ModuleKey } from '@/lib/types/database'

export const MODULE_KEYS: ModuleKey[] = ['dashboard', 'cargas', 'clientes', 'produtos', 'usuarios']

export function hasModuleAccess(permissions: ModuleKey[], moduleKey: ModuleKey): boolean {
  return permissions.includes(moduleKey)
}
