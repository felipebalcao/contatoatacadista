import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createProduto,
  updateProduto,
  listProdutos,
  toggleProdutoAtivo,
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

const inputBase: ProdutoInput = {
  codigo: CODIGO_TESTE,
  codigo_barras: null,
  nome: 'Produto Teste',
  unidade: 'un',
  categoria: null,
}

describe('produto-actions', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('produtos').delete().in('codigo', [CODIGO_TESTE, 'TESTE-0002'])
  })

  it('cria um produto válido', async () => {
    const produto = await createProduto(inputBase)

    expect(produto.codigo).toBe(CODIGO_TESTE)
    expect(produto.ativo).toBe(true)
  })

  it('rejeita código duplicado', async () => {
    await createProduto({ ...inputBase, nome: 'Primeiro Cadastro' })

    await expect(
      createProduto({ ...inputBase, nome: 'Segundo Cadastro' })
    ).rejects.toThrow('Já existe um produto cadastrado com esse código.')
  })

  it('rejeita código duplicado ao editar', async () => {
    await createProduto(inputBase)
    const outro = await createProduto({ ...inputBase, codigo: 'TESTE-0002', nome: 'Outro' })
    await expect(
      updateProduto(outro.id, { ...inputBase, codigo: CODIGO_TESTE })
    ).rejects.toThrow('Já existe um produto cadastrado com esse código.')
  })

  it('atualiza um produto existente', async () => {
    const produto = await createProduto({ ...inputBase, nome: 'Nome Original' })

    const atualizado = await updateProduto(produto.id, { ...inputBase, nome: 'Nome Atualizado' })

    expect(atualizado.nome).toBe('Nome Atualizado')
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
    const produto = await createProduto(inputBase)

    await toggleProdutoAtivo(produto.id, false)
    let lista = await listProdutos()
    expect(lista.find((p) => p.id === produto.id)?.ativo).toBe(false)

    await toggleProdutoAtivo(produto.id, true)
    lista = await listProdutos()
    expect(lista.find((p) => p.id === produto.id)?.ativo).toBe(true)
  })

  it('rejeita chamadas de um usuário sem permissão de produtos', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listProdutos()).rejects.toThrow('Acesso negado.')
  })

  it('busca por nome contendo vírgula não quebra o filtro', async () => {
    await createProduto({ ...inputBase, nome: 'Produto, Com Vírgula' })

    const resultados = await listProdutos('Produto, Com Vírgula')

    expect(resultados.some((p) => p.codigo === CODIGO_TESTE)).toBe(true)
  })
})
