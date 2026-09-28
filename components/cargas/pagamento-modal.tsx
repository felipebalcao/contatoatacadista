'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createPagamento, updatePagamento } from '@/actions/carga-lancamentos-actions'
import type { Pagamento, PagamentoInput } from '@/lib/types/database'

export function PagamentoModal({
  open,
  onOpenChange,
  cargaId,
  pagamento,
  dataPadrao,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cargaId: string
  pagamento: Pagamento | null
  dataPadrao: string
}) {
  const router = useRouter()
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [observacao, setObservacao] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setValor(pagamento ? String(pagamento.valor) : '')
      setData(pagamento?.data ?? dataPadrao)
      setObservacao(pagamento?.observacao ?? '')
      setError(null)
    }
  }, [open, pagamento, dataPadrao])

  function handleSalvar() {
    setError(null)
    const valorNum = Number(valor)

    if (valor.trim() === '' || !Number.isFinite(valorNum) || valorNum <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }
    if (data === '') {
      setError('Informe uma data válida.')
      return
    }

    const input: PagamentoInput = {
      valor: valorNum,
      data,
      observacao: observacao.trim() === '' ? null : observacao,
    }

    startTransition(async () => {
      try {
        if (pagamento) {
          await updatePagamento(pagamento.id, input)
        } else {
          await createPagamento(cargaId, input)
        }
        onOpenChange(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar o pagamento.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{pagamento ? 'Editar pagamento' : 'Novo pagamento'}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleSalvar()
          }}
          className="mt-4 space-y-4"
        >
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pagamento-valor">Valor (R$)</Label>
              <Input
                id="pagamento-valor"
                type="number"
                step="any"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pagamento-data">Data</Label>
              <Input id="pagamento-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pagamento-observacao">Observação (opcional)</Label>
            <Input
              id="pagamento-observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Pix, boleto, parcela 1 de 3..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
