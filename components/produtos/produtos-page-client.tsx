'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProdutosTable } from './produtos-table'
import { listProdutos, toggleProdutoAtivo } from '@/actions/produto-actions'
import type { Produto } from '@/lib/types/database'

export function ProdutosPageClient({ produtosIniciais }: { produtosIniciais: Produto[] }) {
  const [produtos, setProdutos] = useState(produtosIniciais)
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBuscar(formData: FormData) {
    const query = (formData.get('busca') as string) ?? ''
    setBusca(query)
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await listProdutos(query || undefined)
        setProdutos(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar produtos.')
      }
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        await toggleProdutoAtivo(id, ativo)
        const resultado = await listProdutos(busca || undefined)
        setProdutos(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao atualizar produto.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Produtos</h1>
        <Link href="/produtos/novo" className={buttonVariants({ variant: 'default' })}>
          Novo produto
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={handleBuscar} className="flex gap-2 max-w-sm">
        <Input name="busca" placeholder="Buscar por nome ou código" defaultValue={busca} />
        <Button type="submit" variant="outline" disabled={isPending}>
          Buscar
        </Button>
      </form>
      <ProdutosTable produtos={produtos} onToggleAtivo={handleToggleAtivo} />
    </div>
  )
}
