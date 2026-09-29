export function detectarDuplicadas(chaves: (string | null)[], chavesExistentes: string[]): boolean[] {
  const existentes = new Set(chavesExistentes)
  const vistas = new Set<string>()

  return chaves.map((chave) => {
    if (chave === null) return false
    const duplicada = existentes.has(chave) || vistas.has(chave)
    vistas.add(chave)
    return duplicada
  })
}
