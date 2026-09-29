import { describe, it, expect } from 'vitest'
import { validarLinhaFornecedor } from '@/components/fornecedores/importar-fornecedores-config'

const LINHA_BASE = {
  documento: '',
  nome: 'Fornecedor Teste',
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
  codigo: '',
  inscricao_estadual: '',
  contato: '',
}

describe('validarLinhaFornecedor', () => {
  it('detecta PF por CPF (11 dígitos) e normaliza pontuação', () => {
    const { valores, mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '111.444.777-35' })
    expect(mensagens).toEqual([])
    expect(valores?.tipo).toBe('pf')
    expect(valores?.documento).toBe('11144477735')
  })

  it('detecta PJ por CNPJ (14 dígitos) e normaliza pontuação', () => {
    const { valores, mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '11.222.333/0001-81' })
    expect(mensagens).toEqual([])
    expect(valores?.tipo).toBe('pj')
    expect(valores?.documento).toBe('11222333000181')
  })

  it('rejeita um CPF com dígito verificador errado', () => {
    const { valores, mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '111.444.777-36' })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Documento inválido.')
  })

  it('rejeita documento com tamanho que não é nem CPF nem CNPJ', () => {
    const { valores, mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '123' })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Documento inválido.')
  })

  it('rejeita nome vazio', () => {
    const { mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '111.444.777-35', nome: '' })
    expect(mensagens).toContain('Informe o nome.')
  })

  it('rejeita nome contendo apenas espaços em branco', () => {
    const { valores, mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '111.444.777-35', nome: '   ' })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Informe o nome.')
  })

  it('aceita campos opcionais vazios como null', () => {
    const { valores } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '111.444.777-35' })
    expect(valores?.telefone).toBeNull()
    expect(valores?.email).toBeNull()
  })

  it('preenche código, inscrição estadual e contato quando mapeados', () => {
    const { valores } = validarLinhaFornecedor({
      ...LINHA_BASE,
      documento: '111.444.777-35',
      codigo: '00254',
      inscricao_estadual: '741.136554.0077',
      contato: 'Maria',
    })
    expect(valores?.codigo).toBe('00254')
    expect(valores?.inscricao_estadual).toBe('741.136554.0077')
    expect(valores?.contato).toBe('Maria')
  })
})
