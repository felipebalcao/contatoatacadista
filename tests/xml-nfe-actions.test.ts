import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import { importarXmlNfe } from '@/actions/xml-nfe-actions'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const EAN_CASADO = '7899991110001'
const EAN_AMBIGUO = '7899991110002'
const EAN_INATIVO = '7899991110003'
const EAN_SEM_MATCH = '7899991110004'

let produtoCasadoId: string
let produtoAmbiguoAId: string
let produtoAmbiguoBId: string
let produtoInativoId: string

function xmlComItens(itens: { cEAN: string; xProd: string; qCom: string; vUnCom: string }[]): string {
  const dets = itens
    .map(
      (item, indice) => `
      <det nItem="${indice + 1}">
        <prod>
          <cEAN>${item.cEAN}</cEAN>
          <xProd>${item.xProd}</xProd>
          <qCom>${item.qCom}</qCom>
          <vUnCom>${item.vUnCom}</vUnCom>
        </prod>
      </det>`
    )
    .join('')
  return `<NFe><infNFe Id="NFeTeste" versao="4.00">${dets}</infNFe></NFe>`
}

describe('importarXmlNfe', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()

    const { data: casado } = await supabase
      .from('produtos')
      .insert({ codigo: 'TESTE-XML-CASADO', nome: 'Produto Casado', unidade: 'un', codigo_barras: EAN_CASADO })
      .select()
      .single()
    produtoCasadoId = casado!.id

    const { data: ambiguoA } = await supabase
      .from('produtos')
      .insert({ codigo: 'TESTE-XML-AMBIGUO-A', nome: 'Produto Ambíguo A', unidade: 'un', codigo_barras: EAN_AMBIGUO })
      .select()
      .single()
    produtoAmbiguoAId = ambiguoA!.id

    const { data: ambiguoB } = await supabase
      .from('produtos')
      .insert({ codigo: 'TESTE-XML-AMBIGUO-B', nome: 'Produto Ambíguo B', unidade: 'un', codigo_barras: EAN_AMBIGUO })
      .select()
      .single()
    produtoAmbiguoBId = ambiguoB!.id

    const { data: inativo } = await supabase
      .from('produtos')
      .insert({ codigo: 'TESTE-XML-INATIVO', nome: 'Produto Inativo', unidade: 'un', codigo_barras: EAN_INATIVO, ativo: false })
      .select()
      .single()
    produtoInativoId = inativo!.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('produtos').delete().in('id', [produtoCasadoId, produtoAmbiguoAId, produtoAmbiguoBId, produtoInativoId])
  })

  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  it('casa automaticamente um item com código de barras único', async () => {
    const xml = xmlComItens([{ cEAN: EAN_CASADO, xProd: 'Produto Casado', qCom: '5.0000', vUnCom: '10.0000' }])
    const resultado = await importarXmlNfe(xml)

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados).toHaveLength(1)
    expect(resultado.dados[0].status).toBe('casado')
    expect(resultado.dados[0].produto_id).toBe(produtoCasadoId)
  })

  it('não casa quando dois produtos compartilham o mesmo código de barras', async () => {
    const xml = xmlComItens([{ cEAN: EAN_AMBIGUO, xProd: 'Produto Ambíguo', qCom: '1.0000', vUnCom: '1.0000' }])
    const resultado = await importarXmlNfe(xml)

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados[0].status).toBe('manual')
    expect(resultado.dados[0].produto_id).toBeNull()
  })

  it('não casa com um produto inativo mesmo com código de barras correspondente', async () => {
    const xml = xmlComItens([{ cEAN: EAN_INATIVO, xProd: 'Produto Inativo', qCom: '1.0000', vUnCom: '1.0000' }])
    const resultado = await importarXmlNfe(xml)

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados[0].status).toBe('manual')
  })

  it('marca como manual quando nenhum produto tem aquele código de barras', async () => {
    const xml = xmlComItens([{ cEAN: EAN_SEM_MATCH, xProd: 'Produto Sem Match', qCom: '1.0000', vUnCom: '1.0000' }])
    const resultado = await importarXmlNfe(xml)

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados[0].status).toBe('manual')
  })

  it('devolve erro amigável para um XML que não é NF-e', async () => {
    const resultado = await importarXmlNfe('<algumaCoisa></algumaCoisa>')
    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) throw new Error('esperava falha')
    expect(resultado.erro).toBe('Este arquivo não parece ser o XML de uma NF-e.')
  })

  it('rejeita chamada de um usuário sem acesso ao módulo cargas', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...ADMIN_PROFILE, permissions: ['dashboard'] } as never)
    const xml = xmlComItens([{ cEAN: EAN_CASADO, xProd: 'Produto Casado', qCom: '1.0000', vUnCom: '1.0000' }])
    await expect(importarXmlNfe(xml)).rejects.toThrow('Acesso negado.')
  })
})
