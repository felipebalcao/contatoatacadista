'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CargasTable } from './cargas-table'
import { listCargas, toggleCargaAtivo } from '@/actions/carga-actions'
import type { CargaResumo } from '@/lib/types/database'

export function CargasPageClient({ cargasIniciais }: { cargasIniciais: CargaResumo[] }) {
  const [cargas, setCargas] = useState(cargasIniciais)
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBuscar(formData: FormData) {
    const query = (formData.get('busca') as string) ?? ''
    setBusca(query)
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await listCargas(query || undefined)
        setCargas(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar cargas.')
      }
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        await toggleCargaAtivo(id, ativo)
        const resultado = await listCargas(busca || undefined)
        setCargas(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao atualizar carga.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Cargas</h1>
        <Link href="/cargas/novo" className={buttonVariants({ variant: 'default' })}>
          Nova carga
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={handleBuscar} className="flex gap-2 max-w-sm">
        <Input name="busca" placeholder="Buscar por nome ou fornecedor" defaultValue={busca} />
        <Button type="submit" variant="outline" disabled={isPending}>
          Buscar
        </Button>
      </form>
      <CargasTable cargas={cargas} onToggleAtivo={handleToggleAtivo} />
    </div>
  )
}
