'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createVenda, updateVenda } from '@/actions/venda-actions'
import { formatarMoeda } from '@/lib/formatacao'
import type { TipoComissao, VendaComItens, VendaInput } from '@/lib/types/database'

export interface ProdutoDisponivelVenda {
  id: string
  codigo: string
  nome: string
  unidade: string
}

interface ItemVendaLocal {
  produto_id: string
  produto_codigo: string
  produto_nome: string
  produto_unidade: string
  quantidade: number
  preco_unitario: number
}

const ROTULOS_COMISSAO: Record<TipoComissao, string> = {
  percentual: 'Percentual',
  isento: 'Isento',
  fixo: 'Fixo',
  misto: 'Misto (fixo + percentual)',
}

export function VendaModal({
  open,
  onOpenChange,
  cargaId,
  venda,
  clientes,
  produtosDisponiveis,
  dataPadrao,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cargaId: string
  venda: VendaComItens | null
  clientes: { id: string; nome: string }[]
  produtosDisponiveis: ProdutoDisponivelVenda[]
  dataPadrao: string
}) {
  const router = useRouter()
  const [clienteId, setClienteId] = useState('')
  const [data, setData] = useState('')
  const [notasFiscais, setNotasFiscais] = useState<string[]>([])
  const [novaNota, setNovaNota] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [tipoComissao, setTipoComissao] = useState<TipoComissao>('isento')
  const [comissaoPercentual, setComissaoPercentual] = useState('')
  const [comissaoFixa, setComissaoFixa] = useState('')
  const [itens, setItens] = useState<ItemVendaLocal[]>([])
  const [produtoIdNovo, setProdutoIdNovo] = useState('')
  const [quantidadeNova, setQuantidadeNova] = useState('')
  const [precoNovo, setPrecoNovo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setClienteId(venda?.cliente_id ?? '')
    setData(venda?.data ?? dataPadrao)
    setNotasFiscais(venda?.notas_fiscais ?? [])
    setNovaNota('')
    setVendedor(venda?.vendedor ?? '')
    setEmpresa(venda?.empresa ?? '')
    setTipoComissao(venda?.tipo_comissao ?? 'isento')
    setComissaoPercentual(venda?.comissao_percentual != null ? String(venda.comissao_percentual) : '')
    setComissaoFixa(venda?.comissao_fixa != null ? String(venda.comissao_fixa) : '')
    setItens(
      venda?.itens.map((item) => ({
        produto_id: item.produto_id,
        produto_codigo: item.produto_codigo,
        produto_nome: item.produto_nome,
        produto_unidade: item.produto_unidade,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
      })) ?? []
    )
    setProdutoIdNovo('')
    setQuantidadeNova('')
    setPrecoNovo('')
    setError(null)
  }, [open, venda, dataPadrao])

  const produtosParaSelecionar = produtosDisponiveis.filter(
    (p) => !itens.some((item) => item.produto_id === p.id)
  )
  const total = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0)

  function handleAdicionarNota() {
    const nota = novaNota.trim()
    if (nota === '') return
    setNotasFiscais((atual) => [...atual, nota])
    setNovaNota('')
  }

  function handleRemoverNota(index: number) {
    setNotasFiscais((atual) => atual.filter((_, i) => i !== index))
  }

  function handleAdicionarItem() {
    const produto = produtosDisponiveis.find((p) => p.id === produtoIdNovo)
    const quantidadeNum = Number(quantidadeNova)
    const precoNum = Number(precoNovo)

    if (!produto) {
      setError('Selecione um produto.')
      return
    }
    if (quantidadeNova.trim() === '' || !(quantidadeNum > 0)) {
      setError('Informe uma quantidade válida, maior que zero.')
      return
    }
    if (precoNovo.trim() === '' || !Number.isFinite(precoNum) || precoNum < 0) {
      setError('Informe um preço unitário válido.')
      return
    }

    setError(null)
    setItens((atual) => [
      ...atual,
      {
        produto_id: produto.id,
        produto_codigo: produto.codigo,
        produto_nome: produto.nome,
        produto_unidade: produto.unidade,
        quantidade: quantidadeNum,
        preco_unitario: precoNum,
      },
    ])
    setProdutoIdNovo('')
    setQuantidadeNova('')
    setPrecoNovo('')
  }

  function handleRemoverItem(produtoId: string) {
    setItens((atual) => atual.filter((item) => item.produto_id !== produtoId))
  }

  function handleSalvar() {
    setError(null)

    if (!clienteId) {
      setError('Selecione o cliente.')
      return
    }
    if (itens.length === 0) {
      setError('Adicione pelo menos um produto à venda.')
      return
    }
    if ((tipoComissao === 'percentual' || tipoComissao === 'misto') && comissaoPercentual.trim() === '') {
      setError('Informe o percentual de comissão.')
      return
    }
    if ((tipoComissao === 'fixo' || tipoComissao === 'misto') && comissaoFixa.trim() === '') {
      setError('Informe o valor fixo de comissão.')
      return
    }

    const input: VendaInput = {
      cliente_id: clienteId,
      data,
      notas_fiscais: notasFiscais,
      vendedor: vendedor.trim() === '' ? null : vendedor,
      empresa: empresa.trim() === '' ? null : empresa,
      tipo_comissao: tipoComissao,
      comissao_percentual:
        tipoComissao === 'percentual' || tipoComissao === 'misto' ? Number(comissaoPercentual) : null,
      comissao_fixa: tipoComissao === 'fixo' || tipoComissao === 'misto' ? Number(comissaoFixa) : null,
      itens: itens.map(({ produto_id, quantidade, preco_unitario }) => ({ produto_id, quantidade, preco_unitario })),
    }

    startTransition(async () => {
      const resultado = venda ? await updateVenda(venda.id, cargaId, input) : await createVenda(cargaId, input)

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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>{venda ? 'Editar venda' : 'Nova venda'}</DialogTitle>
        <div className="mt-4 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-cliente">Cliente</Label>
              <select
                id="venda-cliente"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-data">Data</Label>
              <Input id="venda-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="venda-nf">Notas fiscais</Label>
            <div className="flex gap-2">
              <Input
                id="venda-nf"
                value={novaNota}
                onChange={(e) => setNovaNota(e.target.value)}
                placeholder="Número da NF"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAdicionarNota()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={handleAdicionarNota}>
                Adicionar
              </Button>
            </div>
            {notasFiscais.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {notasFiscais.map((nota, index) => (
                  <span
                    key={`${nota}-${index}`}
                    className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                  >
                    {nota}
                    <button type="button" onClick={() => handleRemoverNota(index)} className="text-slate-400 hover:text-slate-700">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-vendedor">Vendedor</Label>
              <Input id="venda-vendedor" value={vendedor} onChange={(e) => setVendedor(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-empresa">Empresa</Label>
              <Input id="venda-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <Label>Produtos</Label>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
              <div className="flex flex-col gap-1.5">
                <select
                  value={produtoIdNovo}
                  onChange={(e) => setProdutoIdNovo(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                >
                  <option value="">Selecione um produto...</option>
                  {produtosParaSelecionar.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Qtd."
                className="w-20"
                value={quantidadeNova}
                onChange={(e) => setQuantidadeNova(e.target.value)}
              />
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Preço"
                className="w-24"
                value={precoNovo}
                onChange={(e) => setPrecoNovo(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleAdicionarItem}>
                Adicionar
              </Button>
            </div>

            {itens.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2">Produto</th>
                    <th className="py-2">Qtd.</th>
                    <th className="py-2">Preço unit.</th>
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
                      <td className="py-2">{formatarMoeda(item.preco_unitario)}</td>
                      <td className="py-2">{formatarMoeda(item.quantidade * item.preco_unitario)}</td>
                      <td className="py-2 text-right">
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoverItem(item.produto_id)}>
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

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-comissao">Tipo de comissão</Label>
              <select
                id="venda-comissao"
                value={tipoComissao}
                onChange={(e) => setTipoComissao(e.target.value as TipoComissao)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                {(Object.keys(ROTULOS_COMISSAO) as TipoComissao[]).map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ROTULOS_COMISSAO[tipo]}
                  </option>
                ))}
              </select>
            </div>

            {(tipoComissao === 'percentual' || tipoComissao === 'misto') && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="venda-comissao-percentual">Comissão (%)</Label>
                <Input
                  id="venda-comissao-percentual"
                  type="number"
                  step="any"
                  min="0"
                  value={comissaoPercentual}
                  onChange={(e) => setComissaoPercentual(e.target.value)}
                />
              </div>
            )}

            {(tipoComissao === 'fixo' || tipoComissao === 'misto') && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="venda-comissao-fixa">Comissão fixa (R$)</Label>
                <Input
                  id="venda-comissao-fixa"
                  type="number"
                  step="any"
                  min="0"
                  value={comissaoFixa}
                  onChange={(e) => setComissaoFixa(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSalvar} disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
