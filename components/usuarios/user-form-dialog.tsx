'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Plus } from 'lucide-react'
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
    return (
      <Button onClick={() => setOpen(true)} className="h-9 px-3">
        <Plus className="size-4" />
        Novo usuário
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
          Novo
        </p>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">Criar usuário</h2>
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome" className="text-sm font-medium text-slate-700">
          Nome
        </Label>
        <Input id="nome" name="nome" required className="h-9" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email
        </Label>
        <Input id="email" name="email" type="email" required className="h-9" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="roleId" className="text-sm font-medium text-slate-700">
          Papel
        </Label>
        <select
          id="roleId"
          name="roleId"
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none transition-colors duration-150 focus-visible:border-sky-500 focus-visible:ring-3 focus-visible:ring-sky-500/50"
          required
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 border-t border-slate-100 pt-4">
        <Button type="submit" disabled={isPending} className="h-9 px-3">
          {isPending ? 'Criando...' : 'Criar usuário'}
        </Button>
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
