'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Lock, Plus } from 'lucide-react'
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
      <Button
        onClick={() => setOpen(true)}
        variant={isEditing ? 'outline' : 'default'}
        size={isEditing ? 'sm' : 'default'}
        className={isEditing ? undefined : 'h-9 px-3'}
      >
        {!isEditing && <Plus className="size-4" />}
        {isEditing ? 'Editar' : 'Novo papel'}
      </Button>
    )
  }

  return (
    <form
      action={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-lg shadow-slate-900/5"
    >
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-600">
          {isEditing ? 'Editando' : 'Novo'}
        </p>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          {isEditing ? role?.nome : 'Criar papel'}
        </h2>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome" className="text-sm font-medium text-slate-700">
            Nome do papel
          </Label>
          <Input id="nome" name="nome" required className="h-9" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-slate-700">Módulos</Label>

        {role?.permissions_locked && (
          <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            Este papel tem acesso total e não pode ser alterado.
          </p>
        )}

        <div className="flex flex-col gap-0.5">
          {MODULE_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50 has-disabled:cursor-not-allowed has-disabled:text-slate-400 has-disabled:hover:bg-transparent"
            >
              <input
                type="checkbox"
                name={`module-${key}`}
                defaultChecked={role?.permissions.includes(key)}
                disabled={role?.permissions_locked}
                className="size-4 shrink-0 accent-sky-500 outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
              />
              {MODULE_LABELS[key]}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Button
          type="submit"
          disabled={isPending || role?.permissions_locked}
          className="h-9 px-3"
        >
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        {isEditing && !role?.is_system && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
            className="h-9 px-3"
          >
            Excluir
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          className="h-9 px-3 text-slate-500 hover:text-slate-900"
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
