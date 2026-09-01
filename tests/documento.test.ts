import { describe, it, expect } from 'vitest'
import {
  validarCpf,
  validarCnpj,
  validarDocumento,
  normalizarDocumento,
} from '@/lib/validation/documento'

describe('validarCpf', () => {
  it('aceita um CPF válido', () => {
    expect(validarCpf('111.444.777-35')).toBe(true)
  })

  it('rejeita um CPF com dígito verificador errado', () => {
    expect(validarCpf('111.444.777-36')).toBe(false)
  })

  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(validarCpf('111.111.111-11')).toBe(false)
  })

  it('rejeita CPF com tamanho incorreto', () => {
    expect(validarCpf('123')).toBe(false)
  })
})

describe('validarCnpj', () => {
  it('aceita um CNPJ válido', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true)
  })

  it('rejeita um CNPJ com dígito verificador errado', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false)
  })

  it('rejeita CNPJ com todos os dígitos iguais', () => {
    expect(validarCnpj('11.111.111/1111-11')).toBe(false)
  })

  it('rejeita CNPJ com tamanho incorreto', () => {
    expect(validarCnpj('123')).toBe(false)
  })
})

describe('validarDocumento', () => {
  it('valida CPF quando tipo é pf', () => {
    expect(validarDocumento('pf', '111.444.777-35')).toBe(true)
  })

  it('valida CNPJ quando tipo é pj', () => {
    expect(validarDocumento('pj', '11.222.333/0001-81')).toBe(true)
  })
})

describe('normalizarDocumento', () => {
  it('remove pontuação, mantendo só dígitos', () => {
    expect(normalizarDocumento('111.444.777-35')).toBe('11144477735')
  })
})
