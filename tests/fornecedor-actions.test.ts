import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createFornecedor,
  updateFornecedor,
  listFornecedores,
  toggleFornecedorAtivo,
} from '@/actions/fornecedor-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { FornecedorInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const DOCUMENTO_TESTE = '11144477735'

const inputBase: FornecedorInput = {
  tipo: 'pf',
  documento: '111.444.777-35',
  nome: 'Fornecedor Teste',
  nome_fantasia: null,
  telefone: null,
  email: null,
  endereco_rua: null,
  endereco_numero: null,
  endereco_bairro: null,
  endereco_cidade: null,
  endereco_uf: null,
  endereco_cep: null,
  observacoes: null,
}

describe('fornecedor-actions', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('documento', DOCUMENTO_TESTE)
  })

  it('cria um fornecedor PF válido', async () => {
    const fornecedor = await createFornecedor(inputBase)

    expect(fornecedor.documento).toBe(DOCUMENTO_TESTE)
    expect(fornecedor.ativo).toBe(true)
  })

  it('rejeita documento com dígito verificador inválido', async () => {
    await expect(
      createFornecedor({ ...inputBase, documento: '111.444.777-36' })
    ).rejects.toThrow('Documento inválido.')
  })

  it('rejeita documento duplicado', async () => {
    await createFornecedor({ ...inputBase, nome: 'Primeiro Cadastro' })

    await expect(
      createFornecedor({ ...inputBase, nome: 'Segundo Cadastro' })
    ).rejects.toThrow('Já existe um fornecedor cadastrado com esse documento.')
  })

  it('atualiza um fornecedor existente', async () => {
    const fornecedor = await createFornecedor({ ...inputBase, nome: 'Nome Original' })

    const atualizado = await updateFornecedor(fornecedor.id, { ...inputBase, nome: 'Nome Atualizado' })

    expect(atualizado.nome).toBe('Nome Atualizado')
  })

  it('lista fornecedores filtrando por nome, excluindo os que não combinam', async () => {
    await createFornecedor({ ...inputBase, nome: 'Fornecedor Buscável' })
    await createFornecedor({
      ...inputBase,
      tipo: 'pj',
      documento: '11.222.333/0001-81',
      nome: 'Outra Empresa Qualquer',
    })

    const resultados = await listFornecedores('Buscável')

    expect(resultados.some((f) => f.documento === DOCUMENTO_TESTE)).toBe(true)
    expect(resultados.some((f) => f.documento === '11222333000181')).toBe(false)

    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('documento', '11222333000181')
  })

  it('inativa e reativa um fornecedor', async () => {
    const fornecedor = await createFornecedor(inputBase)

    await toggleFornecedorAtivo(fornecedor.id, false)
    let lista = await listFornecedores()
    expect(lista.find((f) => f.id === fornecedor.id)?.ativo).toBe(false)

    await toggleFornecedorAtivo(fornecedor.id, true)
    lista = await listFornecedores()
    expect(lista.find((f) => f.id === fornecedor.id)?.ativo).toBe(true)
  })

  it('rejeita chamadas de um usuário sem permissão de fornecedores', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listFornecedores()).rejects.toThrow('Acesso negado.')
  })

  it('busca por nome contendo vírgula não quebra o filtro', async () => {
    await createFornecedor({ ...inputBase, nome: 'Fornecedor, Com Vírgula' })

    const resultados = await listFornecedores('Fornecedor, Com Vírgula')

    expect(resultados.some((f) => f.documento === DOCUMENTO_TESTE)).toBe(true)
  })
})
