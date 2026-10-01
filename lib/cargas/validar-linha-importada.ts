export interface LinhaImportadaParaValidar {
  produto_id: string | null
  quantidade: string
  valor_unitario: string
}

export function linhaImportadaValida(
  linha: LinhaImportadaParaValidar,
  produtosDisponiveis: { id: string }[]
): boolean {
  if (!linha.produto_id) return false
  if (!produtosDisponiveis.some((p) => p.id === linha.produto_id)) return false
  if (linha.quantidade.trim() === '') return false
  if (linha.valor_unitario.trim() === '') return false
  const quantidadeNum = Number(linha.quantidade)
  const valorNum = Number(linha.valor_unitario)
  if (!(quantidadeNum > 0)) return false
  if (!Number.isFinite(valorNum) || valorNum < 0) return false
  return true
}
