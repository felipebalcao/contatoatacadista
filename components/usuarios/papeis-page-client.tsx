'use client'

import { useRouter } from 'next/navigation'
import { RoleFormDialog } from './role-form-dialog'
import type { ModuleKey, Role } from '@/lib/types/database'

const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  cargas: 'Cargas',
  clientes: 'Clientes',
  produtos: 'Produtos',
  usuarios: 'Usuários',
}

export function PapeisPageClient({ roles }: { roles: (Role & { permissions: ModuleKey[] })[] }) {
  const router = useRouter()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Papéis</h1>
        <RoleFormDialog onSaved={() => router.refresh()} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2">Papel</th>
            <th className="py-2">Módulos</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id} className="border-b">
              <td className="py-2">{role.nome}</td>
              <td className="py-2">
                {role.permissions.length === 0 ? '—' : role.permissions.map((p) => MODULE_LABELS[p]).join(', ')}
              </td>
              <td className="py-2 text-right">
                <RoleFormDialog role={role} onSaved={() => router.refresh()} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
