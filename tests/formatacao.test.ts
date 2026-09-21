import { describe, it, expect } from 'vitest'
import { formatarMoeda, formatarData } from '@/lib/formatacao'

describe('formatarMoeda', () => {
  it('formata em reais com separadores brasileiros', () => {
    expect(formatarMoeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50')
  })

  it('formata zero', () => {
    expect(formatarMoeda(0).replace(/\s/g, ' ')).toBe('R$ 0,00')
  })
})

describe('formatarData', () => {
  it('converte YYYY-MM-DD em DD/MM/YYYY sem passar por Date (sem deslocar o dia)', () => {
    expect(formatarData('2026-09-20')).toBe('20/09/2026')
  })
})
