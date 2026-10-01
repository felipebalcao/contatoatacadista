import { describe, it, expect } from 'vitest'
import { mesclarItensImportados } from './mesclar-itens-importados'
import type { ItemCargaLocal } from '@/components/cargas/adicionar-produto-modal'

function item(produtoId: string, quantidade: number, valorUnitario: number): ItemCargaLocal {
  return {
    produto_id: produtoId,
    produto_codigo: `COD-${produtoId}`,
    produto_nome: `Produto ${produtoId}`,
    produto_unidade: 'un',
    quantidade,
    valor_unitario: valorUnitario,
  }
}

describe('mesclarItensImportados', () => {
  it('adiciona como item novo quando o produto não está na lista atual', () => {
    const resultado = mesclarItensImportados([], [item('p1', 5, 10)])
    expect(resultado).toEqual([item('p1', 5, 10)])
  })

  it('soma a quantidade quando o produto já está na lista atual, usando o valor do importado', () => {
    const atuais = [item('p1', 10, 5)]
    const resultado = mesclarItensImportados(atuais, [item('p1', 3, 8)])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].quantidade).toBe(13)
    expect(resultado[0].valor_unitario).toBe(8)
  })

  it('soma itens duplicados dentro da própria importação, mesmo sem estar na lista atual', () => {
    const resultado = mesclarItensImportados([], [item('p1', 2, 10), item('p1', 3, 12)])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].quantidade).toBe(5)
    expect(resultado[0].valor_unitario).toBe(12)
  })

  it('mantém itens de produtos diferentes como linhas separadas', () => {
    const resultado = mesclarItensImportados([item('p1', 1, 1)], [item('p2', 2, 2)])
    expect(resultado).toHaveLength(2)
  })

  it('não modifica os arrays originais (itensAtuais permanece intacto)', () => {
    const atuais = [item('p1', 10, 5)]
    mesclarItensImportados(atuais, [item('p1', 3, 8)])
    expect(atuais[0].quantidade).toBe(10)
  })

  it('soma corretamente quando o produto já está na lista atual E aparece duas vezes na importação', () => {
    const atuais = [item('p1', 10, 5)]
    const resultado = mesclarItensImportados(atuais, [item('p1', 2, 10), item('p1', 3, 12)])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].quantidade).toBe(15)
    expect(resultado[0].valor_unitario).toBe(12)
  })
})
