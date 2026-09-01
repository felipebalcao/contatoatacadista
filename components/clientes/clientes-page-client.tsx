'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClientesTable } from './clientes-table'
import { listClientes, toggleClienteAtivo } from '@/actions/cliente-actions'
import type { Cliente } from '@/lib/types/database'

export function ClientesPageClient({ clientesIniciais }: { clientesIniciais: Cliente[] }) {
  const [clientes, setClientes] = useState(clientesIniciais)
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBuscar(formData: FormData) {
    const query = (formData.get('busca') as string) ?? ''
    setBusca(query)
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await listClientes(query || undefined)
        setClientes(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar clientes.')
      }
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        await toggleClienteAtivo(id, ativo)
        const resultado = await listClientes(busca || undefined)
        setClientes(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao atualizar cliente.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Clientes</h1>
        <Link href="/clientes/novo" className={buttonVariants({ variant: 'default' })}>
          Novo cliente
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={handleBuscar} className="flex gap-2 max-w-sm">
        <Input name="busca" placeholder="Buscar por nome ou documento" defaultValue={busca} />
        <Button type="submit" variant="outline" disabled={isPending}>
          Buscar
        </Button>
      </form>
      <ClientesTable clientes={clientes} onToggleAtivo={handleToggleAtivo} />
    </div>
  )
}
