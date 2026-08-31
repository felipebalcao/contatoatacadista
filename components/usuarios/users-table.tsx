import { UserPlus } from 'lucide-react'
import type { Profile, Role } from '@/lib/types/database'

export function UsersTable({ users }: { users: (Profile & { role: Role })[] }) {
  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-sky-50 text-sky-600">
          <UserPlus className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-slate-900">Nenhum usuário cadastrado</p>
          <p className="text-sm text-slate-500">
            Crie o primeiro usuário para liberar o acesso ao sistema.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Nome
            </th>
            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Email
            </th>
            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Papel
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((user) => (
            <tr key={user.id} className="group transition-colors duration-150 hover:bg-sky-50/50">
              <td className="border-l-2 border-transparent px-4 py-3 font-medium text-slate-900 transition-colors duration-150 group-hover:border-sky-500">
                {user.nome}
              </td>
              <td className="px-4 py-3 text-slate-600">{user.email}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {user.role.nome}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
