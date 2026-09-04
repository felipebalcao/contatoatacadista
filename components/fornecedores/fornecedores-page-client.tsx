'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FornecedoresTable } from './fornecedores-table'
import { listFornecedores, toggleFornecedorAtivo } from '@/actions/fornecedor-actions'
import type { Fornecedor } from '@/lib/types/database'

export function FornecedoresPageClient({ fornecedoresIniciais }: { fornecedoresIniciais: Fornecedor[] }) {
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais)
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBuscar(formData: FormData) {
    const query = (formData.get('busca') as string) ?? ''
    setBusca(query)
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await listFornecedores(query || undefined)
        setFornecedores(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar fornecedores.')
      }
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        await toggleFornecedorAtivo(id, ativo)
        const resultado = await listFornecedores(busca || undefined)
        setFornecedores(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao atualizar fornecedor.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Fornecedores</h1>
        <Link href="/fornecedores/novo" className={buttonVariants({ variant: 'default' })}>
          Novo fornecedor
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={handleBuscar} className="flex gap-2 max-w-sm">
        <Input name="busca" placeholder="Buscar por nome ou documento" defaultValue={busca} />
        <Button type="submit" variant="outline" disabled={isPending}>
          Buscar
        </Button>
      </form>
      <FornecedoresTable fornecedores={fornecedores} onToggleAtivo={handleToggleAtivo} />
    </div>
  )
}
