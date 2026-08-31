'use client'

import { useRouter } from 'next/navigation'
import { UsersTable } from './users-table'
import { UserFormDialog } from './user-form-dialog'
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Usuários</h1>
        <UserFormDialog roles={roles} onCreated={() => router.refresh()} />
      </div>
      <UsersTable users={users} />
      <p className="text-sm text-slate-500">
        Criação de usuário dispara um convite por email para definir a senha.
      </p>
    </div>
  )
}
