import { describe, it, expect } from 'vitest'
import { gerarSenha } from '@/lib/auth/gerar-senha'

describe('gerarSenha', () => {
  it('gera uma senha com 12 caracteres por padrão', () => {
    expect(gerarSenha()).toHaveLength(12)
  })

  it('gera uma senha com o tamanho pedido', () => {
    expect(gerarSenha(20)).toHaveLength(20)
  })

  it('não usa caracteres ambíguos (0, O, 1, l, I)', () => {
    const senha = gerarSenha(200)
    expect(senha).not.toMatch(/[0O1lI]/)
  })

  it('gera senhas diferentes a cada chamada', () => {
    const senhas = new Set(Array.from({ length: 20 }, () => gerarSenha()))
    expect(senhas.size).toBe(20)
  })
})
