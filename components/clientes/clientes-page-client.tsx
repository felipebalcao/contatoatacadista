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
  const [isPending, startTransition] = useTransition()

  function handleBuscar(formData: FormData) {
    const query = (formData.get('busca') as string) ?? ''
    setBusca(query)
    startTransition(async () => {
      const resultado = await listClientes(query || undefined)
      setClientes(resultado)
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    startTransition(async () => {
      await toggleClienteAtivo(id, ativo)
      const resultado = await listClientes(busca || undefined)
      setClientes(resultado)
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
