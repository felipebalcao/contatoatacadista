export interface ResumoCarga {
  custoTotal: number
  custosExtras: number
  pago: number
  falta: number
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

function somar(valores: number[]): number {
  return valores.reduce((soma, valor) => soma + valor, 0)
}

export function calcularResumoCarga(
  itens: { quantidade: number; valor_unitario: number }[],
  custos: { valor: number }[],
  pagamentos: { valor: number }[]
): ResumoCarga {
  const custoTotal = centavos(somar(itens.map((item) => item.quantidade * item.valor_unitario)))
  const custosExtras = centavos(somar(custos.map((custo) => custo.valor)))
  const pago = centavos(somar(pagamentos.map((pagamento) => pagamento.valor)))

  return { custoTotal, custosExtras, pago, falta: centavos(custoTotal - pago) }
}
