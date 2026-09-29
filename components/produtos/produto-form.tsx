'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProduto, updateProduto } from '@/actions/produto-actions'
import type { Produto, ProdutoInput } from '@/lib/types/database'

export function ProdutoForm({
  produto,
  codigoSugerido,
}: {
  produto?: Produto
  codigoSugerido?: string
}) {
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
      referencia: (formData.get('referencia') as string) || null,
      ncm: (formData.get('ncm') as string) || null,
      codigo_anp: (formData.get('codigo_anp') as string) || null,
      cfop_dentro_estado: (formData.get('cfop_dentro_estado') as string) || null,
      cfop_fora_estado: (formData.get('cfop_fora_estado') as string) || null,
      cst_icms: (formData.get('cst_icms') as string) || null,
      aliquota_icms: (formData.get('aliquota_icms') as string) || null,
      cst_pis: (formData.get('cst_pis') as string) || null,
      aliquota_pis: (formData.get('aliquota_pis') as string) || null,
      cst_cofins: (formData.get('cst_cofins') as string) || null,
      aliquota_cofins: (formData.get('aliquota_cofins') as string) || null,
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
          <Input id="codigo" name="codigo" defaultValue={produto?.codigo ?? codigoSugerido} required />
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

      <fieldset className="flex flex-col gap-4 border-t pt-4">
        <legend className="text-sm font-medium">Dados fiscais</legend>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="referencia">Referência</Label>
            <Input id="referencia" name="referencia" defaultValue={produto?.referencia ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ncm">NCM</Label>
            <Input id="ncm" name="ncm" defaultValue={produto?.ncm ?? ''} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="codigo_anp">Código ANP</Label>
            <Input id="codigo_anp" name="codigo_anp" defaultValue={produto?.codigo_anp ?? ''} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfop_dentro_estado">CFOP (dentro do estado)</Label>
            <Input
              id="cfop_dentro_estado"
              name="cfop_dentro_estado"
              defaultValue={produto?.cfop_dentro_estado ?? ''}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfop_fora_estado">CFOP (fora do estado)</Label>
            <Input id="cfop_fora_estado" name="cfop_fora_estado" defaultValue={produto?.cfop_fora_estado ?? ''} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cst_icms">CST ICMS</Label>
            <Input id="cst_icms" name="cst_icms" defaultValue={produto?.cst_icms ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aliquota_icms">Alíquota ICMS</Label>
            <Input id="aliquota_icms" name="aliquota_icms" defaultValue={produto?.aliquota_icms ?? ''} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cst_pis">CST PIS</Label>
            <Input id="cst_pis" name="cst_pis" defaultValue={produto?.cst_pis ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aliquota_pis">Alíquota PIS</Label>
            <Input id="aliquota_pis" name="aliquota_pis" defaultValue={produto?.aliquota_pis ?? ''} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cst_cofins">CST COFINS</Label>
            <Input id="cst_cofins" name="cst_cofins" defaultValue={produto?.cst_cofins ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aliquota_cofins">Alíquota COFINS</Label>
            <Input id="aliquota_cofins" name="aliquota_cofins" defaultValue={produto?.aliquota_cofins ?? ''} />
          </div>
        </div>
      </fieldset>

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
