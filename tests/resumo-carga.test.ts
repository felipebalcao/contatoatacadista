import { describe, it, expect } from 'vitest'
import { calcularResumoCarga } from '@/lib/cargas/resumo'

describe('calcularResumoCarga', () => {
  it('retorna zeros quando não há nada', () => {
    expect(calcularResumoCarga([], [], [])).toEqual({
      custoTotal: 0,
      custosExtras: 0,
      pago: 0,
      falta: 0,
      vendido: 0,
      lucro: 0,
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

  it('retorna vendido e lucro zerados quando não há vendas', () => {
    const resumo = calcularResumoCarga([{ produto_id: 'p1', quantidade: 4, valor_unitario: 2.5 }], [], [], [])
    expect(resumo.vendido).toBe(0)
    expect(resumo.lucro).toBe(0)
  })

  it('calcula vendido e lucro com comissão isenta', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendas = [
      {
        tipo_comissao: 'isento' as const,
        comissao_percentual: null,
        comissao_fixa: null,
        itens: [{ produto_id: 'p1', quantidade: 4, preco_unitario: 5 }],
      },
    ]
    const resumo = calcularResumoCarga(itens, [], [], vendas)
    expect(resumo.vendido).toBe(20)
    expect(resumo.lucro).toBe(12)
  })

  it('calcula comissão percentual, fixa e mista corretamente', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendaPercentual = {
      tipo_comissao: 'percentual' as const,
      comissao_percentual: 10,
      comissao_fixa: null,
      itens: [{ produto_id: 'p1', quantidade: 1, preco_unitario: 100 }],
    }
    const vendaFixa = {
      tipo_comissao: 'fixo' as const,
      comissao_percentual: null,
      comissao_fixa: 15,
      itens: [{ produto_id: 'p1', quantidade: 1, preco_unitario: 100 }],
    }
    const vendaMista = {
      tipo_comissao: 'misto' as const,
      comissao_percentual: 10,
      comissao_fixa: 15,
      itens: [{ produto_id: 'p1', quantidade: 1, preco_unitario: 100 }],
    }

    expect(calcularResumoCarga(itens, [], [], [vendaPercentual]).lucro).toBe(100 - 10 - 2)
    expect(calcularResumoCarga(itens, [], [], [vendaFixa]).lucro).toBe(100 - 15 - 2)
    expect(calcularResumoCarga(itens, [], [], [vendaMista]).lucro).toBe(100 - 25 - 2)
  })

  it('comissão isento ignora comissao_percentual/comissao_fixa mesmo se vierem preenchidos por engano', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendas = [
      {
        tipo_comissao: 'isento' as const,
        comissao_percentual: 50,
        comissao_fixa: 999,
        itens: [{ produto_id: 'p1', quantidade: 4, preco_unitario: 5 }],
      },
    ]
    const resumo = calcularResumoCarga(itens, [], [], vendas)
    expect(resumo.vendido).toBe(20)
    expect(resumo.lucro).toBe(12)
  })

  it('venda de um produto que não está nos itens da carga entra com custo zero, sem quebrar', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendas = [
      {
        tipo_comissao: 'isento' as const,
        comissao_percentual: null,
        comissao_fixa: null,
        itens: [{ produto_id: 'produto-que-nao-esta-na-carga', quantidade: 2, preco_unitario: 10 }],
      },
    ]
    const resumo = calcularResumoCarga(itens, [], [], vendas)
    expect(resumo.vendido).toBe(20)
    expect(resumo.lucro).toBe(20)
  })

  it('desconta custos extras do lucro', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendas = [
      {
        tipo_comissao: 'isento' as const,
        comissao_percentual: null,
        comissao_fixa: null,
        itens: [{ produto_id: 'p1', quantidade: 4, preco_unitario: 5 }],
      },
    ]
    const resumo = calcularResumoCarga(itens, [{ valor: 3 }], [], vendas)
    expect(resumo.lucro).toBe(9)
  })
})
