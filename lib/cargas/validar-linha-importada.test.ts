import { describe, it, expect } from 'vitest'
import { linhaImportadaValida } from './validar-linha-importada'

const PRODUTOS = [{ id: 'p1' }, { id: 'p2' }]

describe('linhaImportadaValida', () => {
  it('é válida quando produto existe na lista, e quantidade/valor são números válidos', () => {
    expect(linhaImportadaValida({ produto_id: 'p1', quantidade: '2', valor_unitario: '10' }, PRODUTOS)).toBe(true)
  })

  it('é inválida quando produto_id é nulo', () => {
    expect(linhaImportadaValida({ produto_id: null, quantidade: '2', valor_unitario: '10' }, PRODUTOS)).toBe(false)
  })

  it('é inválida quando produto_id não está na lista de produtos disponíveis', () => {
    expect(
      linhaImportadaValida({ produto_id: 'produto-inexistente', quantidade: '2', valor_unitario: '10' }, PRODUTOS)
    ).toBe(false)
  })

  it('é inválida quando a quantidade está vazia (não trata como zero)', () => {
    expect(linhaImportadaValida({ produto_id: 'p1', quantidade: '', valor_unitario: '10' }, PRODUTOS)).toBe(false)
  })

  it('é inválida quando o valor unitário está vazio (não trata como zero)', () => {
    expect(linhaImportadaValida({ produto_id: 'p1', quantidade: '2', valor_unitario: '' }, PRODUTOS)).toBe(false)
  })

  it('é inválida quando a quantidade não é maior que zero', () => {
    expect(linhaImportadaValida({ produto_id: 'p1', quantidade: '0', valor_unitario: '10' }, PRODUTOS)).toBe(false)
    expect(linhaImportadaValida({ produto_id: 'p1', quantidade: '-1', valor_unitario: '10' }, PRODUTOS)).toBe(false)
  })

  it('é inválida quando o valor unitário é negativo', () => {
    expect(linhaImportadaValida({ produto_id: 'p1', quantidade: '2', valor_unitario: '-5' }, PRODUTOS)).toBe(false)
  })

  it('aceita valor unitário igual a zero (produto gratuito/bonificação)', () => {
    expect(linhaImportadaValida({ produto_id: 'p1', quantidade: '2', valor_unitario: '0' }, PRODUTOS)).toBe(true)
  })
})
