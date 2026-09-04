'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ProdutoDisponivel {
  id: string
  codigo: string
  nome: string
  unidade: string
}

export interface ItemCargaLocal {
  produto_id: string
  produto_codigo: string
  produto_nome: string
  produto_unidade: string
  quantidade: number
  valor_unitario: number
}

export function AdicionarProdutoModal({
  open,
  onOpenChange,
  produtosDisponiveis,
  onAdicionar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  produtosDisponiveis: ProdutoDisponivel[]
  onAdicionar: (item: ItemCargaLocal) => void
}) {
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [valorUnitario, setValorUnitario] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setProdutoId('')
      setQuantidade('')
      setValorUnitario('')
      setError(null)
    }
  }, [open])

  function handleAdicionar() {
    setError(null)
    const produto = produtosDisponiveis.find((p) => p.id === produtoId)
    const quantidadeNum = Number(quantidade)
    const valorNum = Number(valorUnitario)

    if (!produto) {
      setError('Selecione um produto.')
      return
    }
    if (quantidade.trim() === '' || !(quantidadeNum > 0)) {
      setError('Informe uma quantidade válida, maior que zero.')
      return
    }
    if (valorUnitario.trim() === '' || !Number.isFinite(valorNum) || valorNum < 0) {
      setError('Informe um valor unitário válido.')
      return
    }

    onAdicionar({
      produto_id: produto.id,
      produto_codigo: produto.codigo,
      produto_nome: produto.nome,
      produto_unidade: produto.unidade,
      quantidade: quantidadeNum,
      valor_unitario: valorNum,
    })

    setProdutoId('')
    setQuantidade('')
    setValorUnitario('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Adicionar produto</DialogTitle>
        <div className="space-y-4 mt-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="produto_id">Produto</Label>
            <select
              id="produto_id"
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
              className="h-9 rounded-md border border-slate-200 px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {produtosDisponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantidade">Quantidade</Label>
              <Input
                id="quantidade"
                type="number"
                step="any"
                min="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor_unitario">Valor unitário (R$)</Label>
              <Input
                id="valor_unitario"
                type="number"
                step="any"
                min="0"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAdicionar}>
              Adicionar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
