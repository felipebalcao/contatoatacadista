'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { importarXmlNfe, type ItemXmlNfe } from '@/actions/xml-nfe-actions'
import type { ItemCargaLocal, ProdutoDisponivel } from './adicionar-produto-modal'

interface LinhaRevisao {
  chave: string
  produto_id: string | null
  quantidade: string
  valor_unitario: string
  descricao_xml: string
  status: 'casado' | 'manual' | 'erro'
  mensagem_erro: string | null
}

function linhaValida(linha: LinhaRevisao): boolean {
  if (!linha.produto_id) return false
  const quantidadeNum = Number(linha.quantidade)
  const valorNum = Number(linha.valor_unitario)
  if (!(quantidadeNum > 0)) return false
  if (!Number.isFinite(valorNum) || valorNum < 0) return false
  return true
}

export function ImportarXmlModal({
  open,
  onOpenChange,
  produtosDisponiveis,
  onImportar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  produtosDisponiveis: ProdutoDisponivel[]
  onImportar: (itens: ItemCargaLocal[]) => void
}) {
  const [passo, setPasso] = useState<'upload' | 'revisao'>('upload')
  const [linhas, setLinhas] = useState<LinhaRevisao[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function resetar() {
    setPasso('upload')
    setLinhas([])
    setError(null)
  }

  function handleFechar(novoOpen: boolean) {
    if (!novoOpen) resetar()
    onOpenChange(novoOpen)
  }

  function handleArquivoSelecionado(arquivo: File) {
    setError(null)
    const leitor = new FileReader()
    leitor.onload = () => {
      const conteudo = String(leitor.result ?? '')
      startTransition(async () => {
        const resultado = await importarXmlNfe(conteudo)
        if (!resultado.sucesso) {
          setError(resultado.erro)
          return
        }
        setLinhas(
          resultado.dados.map((item: ItemXmlNfe) => ({
            chave: crypto.randomUUID(),
            produto_id: item.produto_id,
            quantidade: item.quantidade != null ? String(item.quantidade) : '',
            valor_unitario: item.valor_unitario != null ? String(item.valor_unitario) : '',
            descricao_xml: item.descricao_xml,
            status: item.status,
            mensagem_erro: item.mensagem_erro,
          }))
        )
        setPasso('revisao')
      })
    }
    leitor.onerror = () => setError('Não foi possível ler o arquivo.')
    leitor.readAsText(arquivo)
  }

  function handleAtualizarLinha(
    chave: string,
    campo: 'produto_id' | 'quantidade' | 'valor_unitario',
    valor: string
  ) {
    setLinhas((atual) =>
      atual.map((linha) =>
        linha.chave === chave ? { ...linha, [campo]: campo === 'produto_id' ? valor || null : valor } : linha
      )
    )
  }

  function handleRemoverLinha(chave: string) {
    setLinhas((atual) => atual.filter((linha) => linha.chave !== chave))
  }

  function handleConfirmar() {
    const itens: ItemCargaLocal[] = linhas.map((linha) => {
      const produto = produtosDisponiveis.find((p) => p.id === linha.produto_id)!
      return {
        produto_id: produto.id,
        produto_codigo: produto.codigo,
        produto_nome: produto.nome,
        produto_unidade: produto.unidade,
        quantidade: Number(linha.quantidade),
        valor_unitario: Number(linha.valor_unitario),
      }
    })
    onImportar(itens)
    handleFechar(false)
  }

  const podeConfirmar = linhas.length > 0 && linhas.every(linhaValida)

  return (
    <Dialog open={open} onOpenChange={handleFechar}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogTitle>Importar XML da NF-e</DialogTitle>
        <div className="mt-4 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {passo === 'upload' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="arquivo-xml">Arquivo XML</Label>
              <Input
                id="arquivo-xml"
                type="file"
                accept=".xml"
                disabled={isPending}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0]
                  if (arquivo) handleArquivoSelecionado(arquivo)
                }}
              />
              {isPending && <p className="text-sm text-slate-500">Lendo arquivo...</p>}
            </div>
          )}

          {passo === 'revisao' && (
            <div className="space-y-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2">Status</th>
                    <th className="py-2">Produto na nota</th>
                    <th className="py-2">Produto do sistema</th>
                    <th className="py-2">Qtd.</th>
                    <th className="py-2">Valor unit.</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha) => (
                    <tr key={linha.chave} className="border-b align-top">
                      <td className="py-2">
                        {linha.status === 'casado' && <span className="text-emerald-700">Casado</span>}
                        {linha.status === 'manual' && <span className="text-amber-700">Selecione</span>}
                        {linha.status === 'erro' && <span className="text-red-700">Erro</span>}
                      </td>
                      <td className="py-2 text-slate-500">
                        {linha.descricao_xml}
                        {linha.mensagem_erro && <p className="text-xs text-red-600">{linha.mensagem_erro}</p>}
                      </td>
                      <td className="py-2">
                        <select
                          value={linha.produto_id ?? ''}
                          onChange={(e) => handleAtualizarLinha(linha.chave, 'produto_id', e.target.value)}
                          className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
                        >
                          <option value="">Selecione...</option>
                          {produtosDisponiveis.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.codigo} — {p.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          className="w-20"
                          value={linha.quantidade}
                          onChange={(e) => handleAtualizarLinha(linha.chave, 'quantidade', e.target.value)}
                        />
                      </td>
                      <td className="py-2">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          className="w-24"
                          value={linha.valor_unitario}
                          onChange={(e) => handleAtualizarLinha(linha.chave, 'valor_unitario', e.target.value)}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoverLinha(linha.chave)}>
                          Remover
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!podeConfirmar && linhas.length > 0 && (
                <p className="text-sm text-amber-700">
                  Selecione um produto e confirme valores válidos em todas as linhas antes de importar.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => handleFechar(false)}>
              Cancelar
            </Button>
            {passo === 'revisao' && (
              <Button type="button" onClick={handleConfirmar} disabled={!podeConfirmar}>
                Confirmar importação
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
