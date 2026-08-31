import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listUsers } from '@/actions/user-actions'
import { listRoles } from '@/actions/role-actions'
import { UsuariosPageClient } from '@/components/usuarios/usuarios-page-client'

export default async function UsuariosPage() {
  await requireModuleAccess('usuarios')
  const [users, roles] = await Promise.all([listUsers(), listRoles()])

  return <UsuariosPageClient users={users} roles={roles} />
}
