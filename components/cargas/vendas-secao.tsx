'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteVenda } from '@/actions/venda-actions'
import { formatarData, formatarMoeda } from '@/lib/formatacao'
import { VendaModal, type ProdutoDisponivelVenda } from './venda-modal'
import type { VendaComItens } from '@/lib/types/database'

function formatarComissao(venda: VendaComItens): string {
  switch (venda.tipo_comissao) {
    case 'isento':
      return 'Isento'
    case 'percentual':
      return `${venda.comissao_percentual}%`
    case 'fixo':
      return formatarMoeda(venda.comissao_fixa ?? 0)
    case 'misto':
      return `${venda.comissao_percentual}% + ${formatarMoeda(venda.comissao_fixa ?? 0)}`
  }
}

export function VendasSecao({
  cargaId,
  vendas,
  clientes,
  produtosDisponiveis,
  dataPadrao,
}: {
  cargaId: string
  vendas: VendaComItens[]
  clientes: { id: string; nome: string }[]
  produtosDisponiveis: ProdutoDisponivelVenda[]
  dataPadrao: string
}) {
  const router = useRouter()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<VendaComItens | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrirNova() {
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(venda: VendaComItens) {
    setEditando(venda)
    setModalAberto(true)
  }

  function handleExcluir(venda: VendaComItens) {
    if (!window.confirm(`Excluir a venda para ${venda.cliente_nome} de ${formatarData(venda.data)}?`)) return
    setError(null)
    startTransition(async () => {
      const resultado = await deleteVenda(venda.id)
      if (!resultado.sucesso) {
        setError(resultado.erro)
        return
      }
      router.refresh()
    })
  }

  function totalVenda(venda: VendaComItens): number {
    return venda.itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">Vendas feitas a partir dos produtos desta carga.</p>
        <Button type="button" onClick={abrirNova}>
          Nova venda
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {vendas.length === 0 ? (
        <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
          Nenhuma venda registrada ainda.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Data</th>
              <th className="py-2">Cliente</th>
              <th className="py-2">NFs</th>
              <th className="py-2">Valor</th>
              <th className="py-2">Comissão</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((venda) => (
              <tr key={venda.id} className="border-b">
                <td className="py-2">{formatarData(venda.data)}</td>
                <td className="py-2">{venda.cliente_nome}</td>
                <td className="py-2 text-slate-500">{venda.notas_fiscais.join(', ') || '—'}</td>
                <td className="py-2">{formatarMoeda(totalVenda(venda))}</td>
                <td className="py-2">{formatarComissao(venda)}</td>
                <td className="py-2 text-right space-x-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => abrirEdicao(venda)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleExcluir(venda)}
                  >
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <VendaModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        cargaId={cargaId}
        venda={editando}
        clientes={clientes}
        produtosDisponiveis={produtosDisponiveis}
        dataPadrao={dataPadrao}
      />
    </div>
  )
}
