import { describe, it, expect } from 'vitest'
import { dataHojeSaoPaulo } from '@/lib/cargas/data-hoje'

describe('dataHojeSaoPaulo', () => {
  it('retorna a data no formato YYYY-MM-DD', () => {
    expect(dataHojeSaoPaulo(new Date('2026-09-20T15:00:00Z'))).toBe('2026-09-20')
  })

  it('usa o dia de São Paulo, não o de UTC, à noite', () => {
    expect(dataHojeSaoPaulo(new Date('2026-09-21T02:30:00Z'))).toBe('2026-09-20')
  })

  it('vira o dia às 00:00 de São Paulo (03:00 UTC)', () => {
    expect(dataHojeSaoPaulo(new Date('2026-09-21T03:00:00Z'))).toBe('2026-09-21')
  })
})
