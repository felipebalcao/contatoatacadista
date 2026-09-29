import { describe, it, expect } from 'vitest'
import { validarLinhaProduto } from '@/components/produtos/importar-produtos-config'

describe('validarLinhaProduto', () => {
  it('aceita uma linha completa', () => {
    const { valores, mensagens } = validarLinhaProduto({
      codigo: '0100',
      nome: 'Produto Teste',
      unidade: 'un',
      codigo_barras: '7891234567890',
      categoria: 'Bebidas',
    })
    expect(mensagens).toEqual([])
    expect(valores).toEqual({
      codigo: '0100',
      nome: 'Produto Teste',
      unidade: 'un',
      codigo_barras: '7891234567890',
      categoria: 'Bebidas',
    })
  })

  it('aceita campos opcionais vazios como null', () => {
    const { valores } = validarLinhaProduto({
      codigo: '0100',
      nome: 'Produto Teste',
      unidade: 'un',
      codigo_barras: '',
      categoria: '',
    })
    expect(valores?.codigo_barras).toBeNull()
    expect(valores?.categoria).toBeNull()
  })

  it('rejeita código vazio', () => {
    const { valores, mensagens } = validarLinhaProduto({
      codigo: '   ',
      nome: 'Produto Teste',
      unidade: 'un',
      codigo_barras: '',
      categoria: '',
    })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Informe o código.')
  })

  it('rejeita nome vazio', () => {
    const { mensagens } = validarLinhaProduto({
      codigo: '0100',
      nome: '',
      unidade: 'un',
      codigo_barras: '',
      categoria: '',
    })
    expect(mensagens).toContain('Informe o nome.')
  })

  it('rejeita unidade vazia', () => {
    const { mensagens } = validarLinhaProduto({
      codigo: '0100',
      nome: 'Produto Teste',
      unidade: '',
      codigo_barras: '',
      categoria: '',
    })
    expect(mensagens).toContain('Informe a unidade.')
  })
})
