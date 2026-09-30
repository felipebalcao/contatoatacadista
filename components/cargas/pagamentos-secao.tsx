'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deletePagamento } from '@/actions/carga-lancamentos-actions'
import { formatarData, formatarMoeda } from '@/lib/formatacao'
import { PagamentoModal } from './pagamento-modal'
import type { Pagamento } from '@/lib/types/database'

export function PagamentosSecao({
  cargaId,
  pagamentos,
  dataPadrao,
}: {
  cargaId: string
  pagamentos: Pagamento[]
  dataPadrao: string
}) {
  const router = useRouter()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Pagamento | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrirNovo() {
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(pagamento: Pagamento) {
    setEditando(pagamento)
    setModalAberto(true)
  }

  function handleExcluir(pagamento: Pagamento) {
    if (!window.confirm(`Excluir o pagamento de ${formatarMoeda(pagamento.valor)} em ${formatarData(pagamento.data)}?`)) return
    setError(null)
    startTransition(async () => {
      const resultado = await deletePagamento(pagamento.id)
      if (!resultado.sucesso) {
        setError(resultado.erro)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">Pagamentos feitos ao fornecedor por esta carga.</p>
        <Button type="button" onClick={abrirNovo}>
          Novo pagamento
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {pagamentos.length === 0 ? (
        <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
          Nenhum pagamento lançado ainda.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Data</th>
              <th className="py-2">Valor</th>
              <th className="py-2">Observação</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pagamentos.map((pagamento) => (
              <tr key={pagamento.id} className="border-b">
                <td className="py-2">{formatarData(pagamento.data)}</td>
                <td className="py-2">{formatarMoeda(pagamento.valor)}</td>
                <td className="py-2 text-slate-500">{pagamento.observacao ?? '—'}</td>
                <td className="py-2 text-right space-x-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => abrirEdicao(pagamento)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleExcluir(pagamento)}
                  >
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <PagamentoModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        cargaId={cargaId}
        pagamento={editando}
        dataPadrao={dataPadrao}
      />
    </div>
  )
}
