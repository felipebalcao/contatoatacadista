'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProduto, updateProduto } from '@/actions/produto-actions'
import type { Produto, ProdutoInput } from '@/lib/types/database'

export function ProdutoForm({ produto }: { produto?: Produto }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEditing = Boolean(produto)

  function handleSubmit(formData: FormData) {
    setError(null)

    const input: ProdutoInput = {
      codigo: formData.get('codigo') as string,
      codigo_barras: (formData.get('codigo_barras') as string) || null,
      nome: formData.get('nome') as string,
      unidade: formData.get('unidade') as string,
      categoria: (formData.get('categoria') as string) || null,
    }

    startTransition(async () => {
      try {
        if (isEditing && produto) {
          await updateProduto(produto.id, input)
        } else {
          await createProduto(input)
        }
        router.push('/produtos')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar produto.')
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="codigo">Código</Label>
          <Input id="codigo" name="codigo" defaultValue={produto?.codigo} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="codigo_barras">Código de barras</Label>
          <Input id="codigo_barras" name="codigo_barras" defaultValue={produto?.codigo_barras ?? ''} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" defaultValue={produto?.nome} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unidade">Unidade</Label>
          <Input id="unidade" name="unidade" placeholder="un, kg, cx..." defaultValue={produto?.unidade} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="categoria">Categoria</Label>
          <Input id="categoria" name="categoria" defaultValue={produto?.categoria ?? ''} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/produtos')}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
