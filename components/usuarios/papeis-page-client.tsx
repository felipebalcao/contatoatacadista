'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react'
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link
            href="/usuarios"
            className="inline-flex w-fit items-center gap-1.5 rounded text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-600 outline-none transition-colors duration-150 hover:text-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="size-3" />
            Usuários
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Papéis</h1>
          <p className="text-sm text-slate-500">
            Defina quais módulos cada papel pode acessar.
          </p>
        </div>
        <RoleFormDialog onSaved={() => router.refresh()} />
      </div>

      <div className="h-px bg-gradient-to-r from-sky-500/40 to-transparent" />

      {roles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-sky-50 text-sky-600">
            <ShieldCheck className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-slate-900">Nenhum papel cadastrado</p>
            <p className="text-sm text-slate-500">
              Crie um papel para definir quais módulos cada usuário acessa.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Papel
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Módulos liberados
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map((role) => (
                <tr
                  key={role.id}
                  className="group align-top transition-colors duration-150 hover:bg-sky-50/50"
                >
                  <td className="border-l-2 border-transparent px-4 py-3 transition-colors duration-150 group-hover:border-sky-500">
                    <span className="flex flex-col gap-1">
                      <span className="font-medium text-slate-900">{role.nome}</span>
                      {role.permissions_locked && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                          <Lock className="size-3" />
                          Permissões fixas
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {role.permissions.length === 0 ? (
                      <span className="text-slate-400">Nenhum módulo</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {role.permissions.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
                          >
                            {MODULE_LABELS[p]}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RoleFormDialog role={role} onSaved={() => router.refresh()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
