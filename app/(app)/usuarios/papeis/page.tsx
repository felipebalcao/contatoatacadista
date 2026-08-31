import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listRoles } from '@/actions/role-actions'
import { PapeisPageClient } from '@/components/usuarios/papeis-page-client'

export default async function PapeisPage() {
  await requireModuleAccess('usuarios')
  const roles = await listRoles()

  return <PapeisPageClient roles={roles} />
}
