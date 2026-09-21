import { describe, it, expect } from 'vitest'
import { calcularResumoCarga } from '@/lib/cargas/resumo'

describe('calcularResumoCarga', () => {
  it('retorna zeros quando não há nada', () => {
    expect(calcularResumoCarga([], [], [])).toEqual({
      custoTotal: 0,
      custosExtras: 0,
      pago: 0,
      falta: 0,
    })
  })

  it('soma quantidade × valor unitário dos itens', () => {
    const itens = [
      { quantidade: 4, valor_unitario: 2.5 },
      { quantidade: 3.5, valor_unitario: 8 },
    ]
    expect(calcularResumoCarga(itens, [], []).custoTotal).toBe(38)
  })

  it('custos extras não entram no que falta pagar', () => {
    const resumo = calcularResumoCarga(
      [{ quantidade: 4, valor_unitario: 2.5 }],
      [{ valor: 100 }],
      [{ valor: 4 }]
    )
    expect(resumo.custosExtras).toBe(100)
    expect(resumo.pago).toBe(4)
    expect(resumo.falta).toBe(6)
  })

  it('falta zero quando o pago é igual ao custo total', () => {
    const resumo = calcularResumoCarga([{ quantidade: 4, valor_unitario: 2.5 }], [], [{ valor: 10 }])
    expect(resumo.falta).toBe(0)
  })

  it('falta negativa quando paga a mais', () => {
    const resumo = calcularResumoCarga([{ quantidade: 4, valor_unitario: 2.5 }], [], [{ valor: 12 }])
    expect(resumo.falta).toBe(-2)
  })

  it('arredonda em centavos para não acumular erro de ponto flutuante', () => {
    const resumo = calcularResumoCarga(
      [{ quantidade: 3, valor_unitario: 0.1 }],
      [],
      [{ valor: 0.1 }, { valor: 0.2 }]
    )
    expect(resumo.custoTotal).toBe(0.3)
    expect(resumo.pago).toBe(0.3)
    expect(resumo.falta).toBe(0)
  })
})
