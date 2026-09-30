import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createProduto,
  updateProduto,
  listProdutos,
  toggleProdutoAtivo,
  getProximoCodigoProduto,
} from '@/actions/produto-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { ProdutoInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const CODIGO_TESTE = 'TESTE-0001'
const CODIGO_NUMERICO_ALTO = '899999998'

const inputBase: ProdutoInput = {
  codigo: CODIGO_TESTE,
  codigo_barras: null,
  nome: 'Produto Teste',
  unidade: 'un',
  categoria: null,
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
}

describe('produto-actions', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('produtos').delete().in('codigo', [CODIGO_TESTE, 'TESTE-0002', CODIGO_NUMERICO_ALTO])
  })

  it('cria um produto válido', async () => {
    const resultado = await createProduto(inputBase)
    if (!resultado.sucesso) throw new Error('esperado sucesso')

    expect(resultado.dados.codigo).toBe(CODIGO_TESTE)
    expect(resultado.dados.ativo).toBe(true)
  })

  it('rejeita código duplicado', async () => {
    await createProduto({ ...inputBase, nome: 'Primeiro Cadastro' })

    const resultado = await createProduto({ ...inputBase, nome: 'Segundo Cadastro' })

    expect(resultado).toEqual({ sucesso: false, erro: 'Já existe um produto cadastrado com esse código.' })
  })

  it('rejeita código duplicado ao editar', async () => {
    await createProduto(inputBase)
    const outroResultado = await createProduto({ ...inputBase, codigo: 'TESTE-0002', nome: 'Outro' })
    if (!outroResultado.sucesso) throw new Error('esperado sucesso')

    const resultado = await updateProduto(outroResultado.dados.id, { ...inputBase, codigo: CODIGO_TESTE })

    expect(resultado).toEqual({ sucesso: false, erro: 'Já existe um produto cadastrado com esse código.' })
  })

  it('atualiza um produto existente', async () => {
    const criado = await createProduto({ ...inputBase, nome: 'Nome Original' })
    if (!criado.sucesso) throw new Error('esperado sucesso')

    const atualizado = await updateProduto(criado.dados.id, { ...inputBase, nome: 'Nome Atualizado' })
    if (!atualizado.sucesso) throw new Error('esperado sucesso')

    expect(atualizado.dados.nome).toBe('Nome Atualizado')
  })

  it('grava e atualiza os dados fiscais do produto', async () => {
    const criado = await createProduto({
      ...inputBase,
      referencia: 'REF-123',
      ncm: '22030000',
      codigo_anp: '000123',
      cfop_dentro_estado: '5405',
      cfop_fora_estado: '6405',
      cst_icms: '060',
      aliquota_icms: '18',
      cst_pis: '01',
      aliquota_pis: '1,65',
      cst_cofins: '01',
      aliquota_cofins: '7,60',
    })
    if (!criado.sucesso) throw new Error('esperado sucesso')

    expect(criado.dados).toMatchObject({
      referencia: 'REF-123',
      ncm: '22030000',
      codigo_anp: '000123',
      cfop_dentro_estado: '5405',
      cfop_fora_estado: '6405',
      cst_icms: '060',
      aliquota_icms: '18',
      cst_pis: '01',
      aliquota_pis: '1,65',
      cst_cofins: '01',
      aliquota_cofins: '7,60',
    })

    const atualizado = await updateProduto(criado.dados.id, { ...inputBase, ncm: '22030001' })
    if (!atualizado.sucesso) throw new Error('esperado sucesso')
    expect(atualizado.dados.ncm).toBe('22030001')
    expect(atualizado.dados.referencia).toBeNull()
  })

  it('lista produtos filtrando por nome, excluindo os que não combinam', async () => {
    await createProduto({ ...inputBase, nome: 'Produto Buscável' })
    await createProduto({
      ...inputBase,
      codigo: 'TESTE-0002',
      nome: 'Outro Item Qualquer',
    })

    const resultados = await listProdutos('Buscável')

    expect(resultados.some((p) => p.codigo === CODIGO_TESTE)).toBe(true)
    expect(resultados.some((p) => p.codigo === 'TESTE-0002')).toBe(false)

    const porCodigo = await listProdutos('TESTE-0002')
    expect(porCodigo.some((p) => p.codigo === 'TESTE-0002')).toBe(true)
    expect(porCodigo.some((p) => p.codigo === CODIGO_TESTE)).toBe(false)
  })

  it('inativa e reativa um produto', async () => {
    const criado = await createProduto(inputBase)
    if (!criado.sucesso) throw new Error('esperado sucesso')

    await toggleProdutoAtivo(criado.dados.id, false)
    let lista = await listProdutos()
    expect(lista.find((p) => p.id === criado.dados.id)?.ativo).toBe(false)

    await toggleProdutoAtivo(criado.dados.id, true)
    lista = await listProdutos()
    expect(lista.find((p) => p.id === criado.dados.id)?.ativo).toBe(true)
  })

  it('rejeita chamadas de um usuário sem permissão de produtos', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listProdutos()).rejects.toThrow('Acesso negado.')
  })

  it('sugere o próximo código sequencial a partir do maior código numérico', async () => {
    await createProduto({ ...inputBase, codigo: CODIGO_NUMERICO_ALTO })

    await expect(getProximoCodigoProduto()).resolves.toBe('899999999')
  })

  it('rejeita a sugestão de código para um usuário sem permissão de produtos', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(getProximoCodigoProduto()).rejects.toThrow('Acesso negado.')
  })

  it('busca por nome contendo vírgula não quebra o filtro', async () => {
    await createProduto({ ...inputBase, nome: 'Produto, Com Vírgula' })

    const resultados = await listProdutos('Produto, Com Vírgula')

    expect(resultados.some((p) => p.codigo === CODIGO_TESTE)).toBe(true)
  })
})
