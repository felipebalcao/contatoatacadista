'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteCusto } from '@/actions/carga-lancamentos-actions'
import { formatarData, formatarMoeda } from '@/lib/formatacao'
import { CustoModal } from './custo-modal'
import type { Custo } from '@/lib/types/database'

export function CustosSecao({
  cargaId,
  custos,
  dataPadrao,
}: {
  cargaId: string
  custos: Custo[]
  dataPadrao: string
}) {
  const router = useRouter()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Custo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrirNovo() {
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(custo: Custo) {
    setEditando(custo)
    setModalAberto(true)
  }

  function handleExcluir(custo: Custo) {
    if (!window.confirm(`Excluir o custo "${custo.categoria}" de ${formatarMoeda(custo.valor)}?`)) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteCusto(custo.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao excluir o custo.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          Custos além do valor dos itens: transporte, comissão, descarga e outros.
        </p>
        <Button type="button" onClick={abrirNovo}>
          Novo custo
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {custos.length === 0 ? (
        <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
          Nenhum custo lançado ainda.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Data</th>
              <th className="py-2">Categoria</th>
              <th className="py-2">Descrição</th>
              <th className="py-2">Valor</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {custos.map((custo) => (
              <tr key={custo.id} className="border-b">
                <td className="py-2">{formatarData(custo.data)}</td>
                <td className="py-2">{custo.categoria}</td>
                <td className="py-2 text-slate-500">{custo.descricao ?? '—'}</td>
                <td className="py-2">{formatarMoeda(custo.valor)}</td>
                <td className="py-2 text-right space-x-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => abrirEdicao(custo)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleExcluir(custo)}
                  >
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CustoModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        cargaId={cargaId}
        custo={editando}
        dataPadrao={dataPadrao}
      />
    </div>
  )
}
