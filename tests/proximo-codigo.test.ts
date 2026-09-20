import { describe, it, expect } from 'vitest'
import { calcularProximoCodigo } from '@/lib/produtos/proximo-codigo'

describe('calcularProximoCodigo', () => {
  it('começa em 0001 quando não há códigos', () => {
    expect(calcularProximoCodigo([])).toBe('0001')
  })

  it('soma 1 ao maior código numérico, com zeros à esquerda', () => {
    expect(calcularProximoCodigo(['0001', '0002', '0009'])).toBe('0010')
  })

  it('compara como número, não como texto', () => {
    expect(calcularProximoCodigo(['9', '10', '2'])).toBe('0011')
  })

  it('ignora códigos que não são puramente numéricos', () => {
    expect(calcularProximoCodigo(['ABC-10', '0003', 'TESTE-0099'])).toBe('0004')
  })

  it('ignora códigos numéricos longos (ex: código de barras digitado como código)', () => {
    expect(calcularProximoCodigo(['7891234567890', '0005'])).toBe('0006')
  })

  it('passa de 9999 sem quebrar', () => {
    expect(calcularProximoCodigo(['9999'])).toBe('10000')
  })

  it('ignora espaços ao redor', () => {
    expect(calcularProximoCodigo([' 0007 '])).toBe('0008')
  })
})
