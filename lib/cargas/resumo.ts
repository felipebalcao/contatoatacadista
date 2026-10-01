export interface ResumoCarga {
  custoTotal: number
  custosExtras: number
  pago: number
  falta: number
  vendido: number
  lucro: number
}

interface ItemVendaParaResumo {
  produto_id: string
  quantidade: number
  preco_unitario: number
}

interface VendaParaResumo {
  tipo_comissao: 'percentual' | 'isento' | 'fixo' | 'misto'
  comissao_percentual: number | null
  comissao_fixa: number | null
  itens: ItemVendaParaResumo[]
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

function somar(valores: number[]): number {
  return valores.reduce((soma, valor) => soma + valor, 0)
}

function comissaoDaVenda(venda: VendaParaResumo, totalVenda: number): number {
  if (venda.tipo_comissao === 'isento') return 0

  let valor = 0
  if (venda.tipo_comissao === 'percentual' || venda.tipo_comissao === 'misto') {
    valor += totalVenda * ((venda.comissao_percentual ?? 0) / 100)
  }
  if (venda.tipo_comissao === 'fixo' || venda.tipo_comissao === 'misto') {
    valor += venda.comissao_fixa ?? 0
  }
  return valor
}

export function calcularResumoCarga(
  itens: { produto_id?: string; quantidade: number; valor_unitario: number }[],
  custos: { valor: number }[],
  pagamentos: { valor: number }[],
  vendas: VendaParaResumo[] = []
): ResumoCarga {
  const custoTotal = centavos(somar(itens.map((item) => item.quantidade * item.valor_unitario)))
  const custosExtras = centavos(somar(custos.map((custo) => custo.valor)))
  const pago = centavos(somar(pagamentos.map((pagamento) => pagamento.valor)))

  const vendido = centavos(
    somar(vendas.flatMap((venda) => venda.itens.map((item) => item.quantidade * item.preco_unitario)))
  )

  const comissoes = centavos(
    somar(
      vendas.map((venda) => {
        const totalVenda = somar(venda.itens.map((item) => item.quantidade * item.preco_unitario))
        return comissaoDaVenda(venda, totalVenda)
      })
    )
  )

  const custoVendido = centavos(
    somar(
      vendas.flatMap((venda) =>
        venda.itens.map((item) => {
          const itemCarga = itens.find((i) => i.produto_id === item.produto_id)
          return item.quantidade * (itemCarga?.valor_unitario ?? 0)
        })
      )
    )
  )

  const lucro = centavos(vendido - custoVendido - comissoes - custosExtras)

  return { custoTotal, custosExtras, pago, falta: centavos(custoTotal - pago), vendido, lucro }
}
