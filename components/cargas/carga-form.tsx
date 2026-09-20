'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCarga, updateCarga } from '@/actions/carga-actions'
import { AdicionarProdutoModal, type ItemCargaLocal, type ProdutoDisponivel } from './adicionar-produto-modal'
import type { CargaComItens, CargaInput } from '@/lib/types/database'

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CargaForm({
  carga,
  fornecedores,
  produtosDisponiveis,
  dataSugerida,
}: {
  carga?: CargaComItens
  fornecedores: { id: string; nome: string }[]
  produtosDisponiveis: ProdutoDisponivel[]
  dataSugerida?: string
}) {
  const router = useRouter()
  const isEditing = Boolean(carga)

  const fornecedoresParaSelecao =
    carga && !fornecedores.some((f) => f.id === carga.fornecedor_id)
      ? [{ id: carga.fornecedor_id, nome: carga.fornecedor_nome }, ...fornecedores]
      : fornecedores

  const [fornecedorId, setFornecedorId] = useState(carga?.fornecedor_id ?? '')
  const [itens, setItens] = useState<ItemCargaLocal[]>(
    carga?.itens.map((item) => ({
      produto_id: item.produto_id,
      produto_codigo: item.produto_codigo,
      produto_nome: item.produto_nome,
      produto_unidade: item.produto_unidade,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
    })) ?? []
  )
  const [modalAberto, setModalAberto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const produtosParaModal = produtosDisponiveis.filter(
    (p) => !itens.some((item) => item.produto_id === p.id)
  )

  const total = itens.reduce((soma, item) => soma + item.quantidade * item.valor_unitario, 0)

  function handleAdicionarItem(item: ItemCargaLocal) {
    setItens((atual) => [...atual, item])
  }

  function handleRemoverItem(produtoId: string) {
    setItens((atual) => atual.filter((item) => item.produto_id !== produtoId))
  }

  function handleSubmit(formData: FormData) {
    setError(null)

    if (itens.length === 0) {
      setError('Adicione pelo menos um produto à carga.')
      return
    }

    const input: CargaInput = {
      fornecedor_id: formData.get('fornecedor_id') as string,
      nome: formData.get('nome') as string,
      data: formData.get('data') as string,
      itens: itens.map(({ produto_id, quantidade, valor_unitario }) => ({
        produto_id,
        quantidade,
        valor_unitario,
      })),
    }

    startTransition(async () => {
      try {
        if (isEditing && carga) {
          await updateCarga(carga.id, input)
        } else {
          await createCarga(input)
        }
        router.push('/cargas')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar carga.')
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-3xl">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fornecedor_id">Fornecedor</Label>
          <select
            id="fornecedor_id"
            name="fornecedor_id"
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
            required
            className="h-9 rounded-md border border-slate-200 px-3 text-sm"
          >
            <option value="">Selecione...</option>
            {fornecedoresParaSelecao.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" defaultValue={carga?.data ?? dataSugerida} required />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome da carga</Label>
        <Input id="nome" name="nome" defaultValue={carga?.nome} required />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Produtos</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setModalAberto(true)}>
            Adicionar produto
          </Button>
        </div>

        {itens.length === 0 ? (
          <p className="text-sm text-slate-500 border border-dashed rounded-lg p-6 text-center">
            Nenhum produto adicionado ainda.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Produto</th>
                <th className="py-2">Qtd.</th>
                <th className="py-2">Valor unit.</th>
                <th className="py-2">Subtotal</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.produto_id} className="border-b">
                  <td className="py-2">
                    {item.produto_codigo} — {item.produto_nome}
                  </td>
                  <td className="py-2">
                    {item.quantidade} {item.produto_unidade}
                  </td>
                  <td className="py-2">{formatarMoeda(item.valor_unitario)}</td>
                  <td className="py-2">{formatarMoeda(item.quantidade * item.valor_unitario)}</td>
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoverItem(item.produto_id)}
                    >
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="text-right text-sm font-medium">Total: {formatarMoeda(total)}</p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || itens.length === 0}>
          {isPending ? 'Salvando...' : 'Salvar carga'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/cargas')}>
          Cancelar
        </Button>
      </div>

      <AdicionarProdutoModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        produtosDisponiveis={produtosParaModal}
        onAdicionar={handleAdicionarItem}
      />
    </form>
  )
}
