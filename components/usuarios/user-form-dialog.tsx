'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createUser } from '@/actions/user-actions'
import type { Role } from '@/lib/types/database'

export function UserFormDialog({ roles, onCreated }: { roles: Role[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createUser(
          formData.get('nome') as string,
          formData.get('email') as string,
          formData.get('roleId') as string
        )
        setOpen(false)
        onCreated()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar usuário.')
      }
    })
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Novo usuário</Button>
  }

  return (
    <form action={handleSubmit} className="border rounded-lg p-4 flex flex-col gap-3 max-w-sm">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="roleId">Papel</Label>
        <select id="roleId" name="roleId" className="border rounded-md h-9 px-2" required>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>{role.nome}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>{isPending ? 'Criando...' : 'Criar'}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  )
}
