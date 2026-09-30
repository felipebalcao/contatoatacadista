'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCusto, updateCusto } from '@/actions/carga-lancamentos-actions'
import type { Custo, CustoInput } from '@/lib/types/database'

const CATEGORIAS_SUGERIDAS = ['Transporte', 'Comissão', 'Descarga']

export function CustoModal({
  open,
  onOpenChange,
  cargaId,
  custo,
  dataPadrao,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cargaId: string
  custo: Custo | null
  dataPadrao: string
}) {
  const router = useRouter()
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setCategoria(custo?.categoria ?? '')
      setDescricao(custo?.descricao ?? '')
      setValor(custo ? String(custo.valor) : '')
      setData(custo?.data ?? dataPadrao)
      setError(null)
    }
  }, [open, custo, dataPadrao])

  function handleSalvar() {
    setError(null)
    const valorNum = Number(valor)

    if (categoria.trim() === '') {
      setError('Informe a categoria.')
      return
    }
    if (valor.trim() === '' || !Number.isFinite(valorNum) || valorNum <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }
    if (data === '') {
      setError('Informe uma data válida.')
      return
    }

    const input: CustoInput = {
      categoria,
      descricao: descricao.trim() === '' ? null : descricao,
      valor: valorNum,
      data,
    }

    startTransition(async () => {
      const resultado = custo ? await updateCusto(custo.id, input) : await createCusto(cargaId, input)

      if (!resultado.sucesso) {
        setError(resultado.erro)
        return
      }

      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{custo ? 'Editar custo' : 'Novo custo'}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleSalvar()
          }}
          className="mt-4 space-y-4"
        >
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custo-categoria">Categoria</Label>
            <Input
              id="custo-categoria"
              list="custo-categorias"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Transporte, Comissão, Descarga..."
            />
            <datalist id="custo-categorias">
              {CATEGORIAS_SUGERIDAS.map((sugestao) => (
                <option key={sugestao} value={sugestao} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custo-descricao">Descrição (opcional)</Label>
            <Input id="custo-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="custo-valor">Valor (R$)</Label>
              <Input
                id="custo-valor"
                type="number"
                step="any"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="custo-data">Data</Label>
              <Input id="custo-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
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
