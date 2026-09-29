import { describe, it, expect } from 'vitest'
import { validarLinhaProduto } from '@/components/produtos/importar-produtos-config'

const LINHA_BASE = {
  codigo: '0100',
  nome: 'Produto Teste',
  unidade: 'un',
  codigo_barras: '',
  categoria: '',
  referencia: '',
  ncm: '',
  codigo_anp: '',
  cfop: '',
  cst_icms: '',
  aliquota_icms: '',
  cst_pis: '',
  aliquota_pis: '',
  cst_cofins: '',
  aliquota_cofins: '',
}

describe('validarLinhaProduto', () => {
  it('aceita uma linha completa', () => {
    const { valores, mensagens } = validarLinhaProduto({
      ...LINHA_BASE,
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
      referencia: null,
      ncm: null,
      codigo_anp: null,
      cfop_dentro_estado: null,
      cfop_fora_estado: null,
      cst_icms: null,
      aliquota_icms: null,
      cst_pis: null,
      aliquota_pis: null,
      cst_cofins: null,
      aliquota_cofins: null,
    })
  })

  it('aceita campos opcionais vazios como null', () => {
    const { valores } = validarLinhaProduto(LINHA_BASE)
    expect(valores?.codigo_barras).toBeNull()
    expect(valores?.categoria).toBeNull()
  })

  it('aceita código vazio como sentinela para geração automática', () => {
    const { valores, mensagens } = validarLinhaProduto({ ...LINHA_BASE, codigo: '   ' })
    expect(mensagens).toEqual([])
    expect(valores?.codigo).toBe('')
  })

  it('rejeita nome vazio', () => {
    const { mensagens } = validarLinhaProduto({ ...LINHA_BASE, nome: '' })
    expect(mensagens).toContain('Informe o nome.')
  })

  it('rejeita unidade vazia', () => {
    const { mensagens } = validarLinhaProduto({ ...LINHA_BASE, unidade: '' })
    expect(mensagens).toContain('Informe a unidade.')
  })

  it('preenche os dados fiscais quando mapeados', () => {
    const { valores } = validarLinhaProduto({
      ...LINHA_BASE,
      referencia: 'REF-123',
      ncm: '22030000',
      codigo_anp: '820101001',
      cfop: '5405 / 6405',
      cst_icms: '060',
      aliquota_icms: '18',
      cst_pis: '01',
      aliquota_pis: '1,65',
      cst_cofins: '01',
      aliquota_cofins: '7,60',
    })
    expect(valores).toMatchObject({
      referencia: 'REF-123',
      ncm: '22030000',
      codigo_anp: '820101001',
      cfop_dentro_estado: '5405',
      cfop_fora_estado: '6405',
      cst_icms: '060',
      aliquota_icms: '18',
      cst_pis: '01',
      aliquota_pis: '1,65',
      cst_cofins: '01',
      aliquota_cofins: '7,60',
    })
  })

  it('separa o CFOP combinado "5405 / 5405" em dentro e fora do estado', () => {
    const { valores } = validarLinhaProduto({ ...LINHA_BASE, cfop: '5405 / 5405' })
    expect(valores?.cfop_dentro_estado).toBe('5405')
    expect(valores?.cfop_fora_estado).toBe('5405')
  })

  it('usa o mesmo CFOP para dentro e fora do estado quando só há um valor', () => {
    const { valores } = validarLinhaProduto({ ...LINHA_BASE, cfop: '5405' })
    expect(valores?.cfop_dentro_estado).toBe('5405')
    expect(valores?.cfop_fora_estado).toBe('5405')
  })

  it('preserva zeros à esquerda nos códigos fiscais', () => {
    const { valores } = validarLinhaProduto({ ...LINHA_BASE, cst_pis: '01', codigo_anp: '000123' })
    expect(valores?.cst_pis).toBe('01')
    expect(valores?.codigo_anp).toBe('000123')
  })
})
