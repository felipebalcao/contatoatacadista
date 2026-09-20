const CODIGO_SEQUENCIAL = /^\d{1,9}$/

export function calcularProximoCodigo(codigos: string[]): string {
  const maior = codigos.reduce((max, codigo) => {
    const limpo = codigo.trim()
    return CODIGO_SEQUENCIAL.test(limpo) ? Math.max(max, Number(limpo)) : max
  }, 0)

  return String(maior + 1).padStart(4, '0')
}
