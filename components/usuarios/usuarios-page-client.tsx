'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Info, ShieldCheck } from 'lucide-react'
import { UsersTable } from './users-table'
import { UserFormDialog } from './user-form-dialog'
import { buttonVariants } from '@/components/ui/button'
import type { Profile, Role } from '@/lib/types/database'

export function UsuariosPageClient({
  users,
  roles,
}: {
  users: (Profile & { role: Role })[]
  roles: Role[]
}) {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-600">
            Configurações
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Usuários</h1>
          <p className="text-sm text-slate-500">
            Quem tem acesso ao sistema e com qual papel.
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <Link
            href="/usuarios/papeis"
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            <ShieldCheck className="size-4" />
            Gerenciar papéis
          </Link>
          <UserFormDialog roles={roles} onCreated={() => router.refresh()} />
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-sky-500/40 to-transparent" />

      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 tabular-nums">
          {users.length} {users.length === 1 ? 'usuário' : 'usuários'}
        </p>
        <UsersTable users={users} />
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-sm text-slate-600">
        <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
        Ao criar um usuário, ele recebe um email com o link para definir a própria senha.
      </p>
    </div>
  )
}
