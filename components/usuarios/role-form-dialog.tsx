'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRole, updateRolePermissions, deleteRole } from '@/actions/role-actions'
import { MODULE_KEYS } from '@/lib/auth/permissions'
import type { ModuleKey, Role } from '@/lib/types/database'

const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  cargas: 'Cargas',
  clientes: 'Clientes',
  produtos: 'Produtos',
  usuarios: 'Usuários',
}

export function RoleFormDialog({
  role,
  onSaved,
}: {
  role?: Role & { permissions: ModuleKey[] }
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEditing = Boolean(role)

  function handleSubmit(formData: FormData) {
    setError(null)
    const nome = formData.get('nome') as string
    const selected = MODULE_KEYS.filter((key) => formData.get(`module-${key}`) === 'on')

    startTransition(async () => {
      try {
        if (isEditing && role) {
          await updateRolePermissions(role.id, selected)
        } else {
          await createRole(nome, selected)
        }
        setOpen(false)
        onSaved()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar papel.')
      }
    })
  }

  function handleDelete() {
    if (!role) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteRole(role.id)
        setOpen(false)
        onSaved()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao excluir papel.')
      }
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant={isEditing ? 'outline' : 'default'} size={isEditing ? 'sm' : 'default'}>
        {isEditing ? 'Editar' : 'Novo papel'}
      </Button>
    )
  }

  return (
    <form action={handleSubmit} className="border rounded-lg p-4 flex flex-col gap-3 max-w-sm">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">Nome do papel</Label>
          <Input id="nome" name="nome" required />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Módulos</Label>
        {MODULE_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={`module-${key}`}
              defaultChecked={role?.permissions.includes(key)}
              disabled={role?.permissions_locked}
            />
            {MODULE_LABELS[key]}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || role?.permissions_locked}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        {isEditing && !role?.is_system && (
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
            Excluir
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  )
}
