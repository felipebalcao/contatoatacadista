import { describe, it, expect } from 'vitest'
import { validarLinhaCliente } from '@/components/clientes/importar-clientes-config'

const LINHA_BASE = {
  documento: '',
  nome: 'Cliente Teste',
  nome_fantasia: '',
  telefone: '',
  email: '',
  endereco_rua: '',
  endereco_numero: '',
  endereco_bairro: '',
  endereco_cidade: '',
  endereco_uf: '',
  endereco_cep: '',
  observacoes: '',
}

describe('validarLinhaCliente', () => {
  it('detecta PF por CPF (11 dígitos) e normaliza pontuação', () => {
    const { valores, mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '111.444.777-35' })
    expect(mensagens).toEqual([])
    expect(valores?.tipo).toBe('pf')
    expect(valores?.documento).toBe('11144477735')
  })

  it('detecta PJ por CNPJ (14 dígitos) e normaliza pontuação', () => {
    const { valores, mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '11.222.333/0001-81' })
    expect(mensagens).toEqual([])
    expect(valores?.tipo).toBe('pj')
    expect(valores?.documento).toBe('11222333000181')
  })

  it('rejeita um CPF com dígito verificador errado', () => {
    const { valores, mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '111.444.777-36' })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Documento inválido.')
  })

  it('rejeita documento com tamanho que não é nem CPF nem CNPJ', () => {
    const { valores, mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '123' })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Documento inválido.')
  })

  it('rejeita nome vazio', () => {
    const { mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '111.444.777-35', nome: '' })
    expect(mensagens).toContain('Informe o nome.')
  })

  it('aceita campos opcionais vazios como null', () => {
    const { valores } = validarLinhaCliente({ ...LINHA_BASE, documento: '111.444.777-35' })
    expect(valores?.telefone).toBeNull()
    expect(valores?.email).toBeNull()
  })
})
