import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listRoles } from '@/actions/role-actions'

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  cargas: 'Cargas',
  clientes: 'Clientes',
  produtos: 'Produtos',
  usuarios: 'Usuários',
}

export default async function PapeisPage() {
  await requireModuleAccess('usuarios')
  const roles = await listRoles()

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Papéis</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2">Papel</th>
            <th className="py-2">Módulos</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id} className="border-b">
              <td className="py-2">{role.nome}</td>
              <td className="py-2">
                {role.permissions.length === 0
                  ? '—'
                  : role.permissions.map((p) => MODULE_LABELS[p]).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
