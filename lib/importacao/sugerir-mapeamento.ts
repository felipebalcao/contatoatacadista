import { normalizarTexto } from './normalizar'
import type { CampoImportacao } from './tipos'

export function sugerirMapeamento(
  colunasCsv: string[],
  campos: CampoImportacao[]
): Record<string, string> {
  const mapeamento: Record<string, string> = {}

  for (const campo of campos) {
    const candidatos = [campo.chave, campo.rotulo, ...(campo.apelidos ?? [])].map(normalizarTexto)
    const coluna = colunasCsv.find((c) => candidatos.includes(normalizarTexto(c)))
    if (coluna) {
      mapeamento[campo.chave] = coluna
    }
  }

  return mapeamento
}
