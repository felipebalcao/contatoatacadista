export function normalizarDocumento(documento: string): string {
  return documento.replace(/\D/g, '')
}

export function validarCpf(cpf: string): boolean {
  const digits = normalizarDocumento(cpf)
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  const calcCheckDigit = (base: string, factorStart: number): number => {
    let sum = 0
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * (factorStart - i)
    }
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const firstNine = digits.slice(0, 9)
  const firstCheck = calcCheckDigit(firstNine, 10)
  const firstTen = firstNine + firstCheck.toString()
  const secondCheck = calcCheckDigit(firstTen, 11)

  return digits === firstNine + firstCheck.toString() + secondCheck.toString()
}

export function validarCnpj(cnpj: string): boolean {
  const digits = normalizarDocumento(cnpj)
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false

  const calcCheckDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split('')
      .reduce((acc, digit, i) => acc + parseInt(digit, 10) * weights[i], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const firstTwelve = digits.slice(0, 12)
  const firstCheck = calcCheckDigit(firstTwelve, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  const firstThirteen = firstTwelve + firstCheck.toString()
  const secondCheck = calcCheckDigit(firstThirteen, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return digits === firstTwelve + firstCheck.toString() + secondCheck.toString()
}

export function validarDocumento(tipo: 'pf' | 'pj', documento: string): boolean {
  return tipo === 'pf' ? validarCpf(documento) : validarCnpj(documento)
}
