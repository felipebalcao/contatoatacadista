export type OrigemDuplicada = 'banco' | 'arquivo' | null

export function detectarDuplicadas(
  chaves: (string | null)[],
  chavesExistentes: string[]
): OrigemDuplicada[] {
  const existentes = new Set(chavesExistentes)
  const vistas = new Set<string>()

  return chaves.map((chave) => {
    if (chave === null) return null
    const origem: OrigemDuplicada = existentes.has(chave) ? 'banco' : vistas.has(chave) ? 'arquivo' : null
    vistas.add(chave)
    return origem
  })
}
