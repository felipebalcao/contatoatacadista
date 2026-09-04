import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createCarga,
  updateCarga,
  listCargas,
  getCarga,
  toggleCargaAtivo,
} from '@/actions/carga-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { CargaInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const DOCUMENTO_FORNECEDOR_TESTE = '11144477735'
const CODIGO_PRODUTO_A = 'TESTE-CARGA-A'
const CODIGO_PRODUTO_B = 'TESTE-CARGA-B'

let fornecedorId: string
let produtoAId: string
let produtoBId: string

describe('carga-actions', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()

    const { data: fornecedor, error: fornecedorError } = await supabase
      .from('fornecedores')
      .insert({ tipo: 'pf', documento: DOCUMENTO_FORNECEDOR_TESTE, nome: 'Fornecedor Teste Carga' })
      .select()
      .single()
    if (fornecedorError) throw fornecedorError
    fornecedorId = fornecedor.id

    const { data: produtoA, error: produtoAError } = await supabase
      .from('produtos')
      .insert({ codigo: CODIGO_PRODUTO_A, nome: 'Produto Teste Carga A', unidade: 'un' })
      .select()
      .single()
    if (produtoAError) throw produtoAError
    produtoAId = produtoA.id

    const { data: produtoB, error: produtoBError } = await supabase
      .from('produtos')
      .insert({ codigo: CODIGO_PRODUTO_B, nome: 'Produto Teste Carga B', unidade: 'kg' })
      .select()
      .single()
    if (produtoBError) throw produtoBError
    produtoBId = produtoB.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('id', fornecedorId)
    await supabase.from('produtos').delete().in('id', [produtoAId, produtoBId])
  })

  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('cargas').delete().eq('fornecedor_id', fornecedorId)
  })

  it('cria uma carga com múltiplos itens atomicamente', async () => {
    const input: CargaInput = {
      fornecedor_id: fornecedorId,
      nome: 'Carga Teste',
      data: '2026-09-04',
      itens: [
        { produto_id: produtoAId, quantidade: 10, valor_unitario: 2.5 },
        { produto_id: produtoBId, quantidade: 3.5, valor_unitario: 8 },
      ],
    }

    const { id } = await createCarga(input)
    const carga = await getCarga(id)

    expect(carga?.nome).toBe('Carga Teste')
    expect(carga?.itens).toHaveLength(2)
  })

  it('rejeita salvar carga sem nenhum item', async () => {
    await expect(
      createCarga({ fornecedor_id: fornecedorId, nome: 'Carga Vazia', data: '2026-09-04', itens: [] })
    ).rejects.toThrow('A carga precisa ter pelo menos um produto.')
  })

  it('não deixa carga órfã se a inserção dos itens falhar', async () => {
    const input: CargaInput = {
      fornecedor_id: fornecedorId,
      nome: 'Carga Com Item Inválido',
      data: '2026-09-04',
      itens: [
        { produto_id: produtoAId, quantidade: 10, valor_unitario: 2.5 },
        { produto_id: produtoAId, quantidade: 5, valor_unitario: 3 },
      ],
    }

    await expect(createCarga(input)).rejects.toThrow()

    const cargas = await listCargas('Carga Com Item Inválido')
    expect(cargas).toHaveLength(0)
  })

  it('atualiza uma carga substituindo a lista de itens', async () => {
    const { id } = await createCarga({
      fornecedor_id: fornecedorId,
      nome: 'Carga Original',
      data: '2026-09-04',
      itens: [{ produto_id: produtoAId, quantidade: 5, valor_unitario: 1 }],
    })

    await updateCarga(id, {
      fornecedor_id: fornecedorId,
      nome: 'Carga Atualizada',
      data: '2026-09-05',
      itens: [{ produto_id: produtoBId, quantidade: 7, valor_unitario: 2 }],
    })

    const carga = await getCarga(id)
    expect(carga?.nome).toBe('Carga Atualizada')
    expect(carga?.itens).toHaveLength(1)
    expect(carga?.itens[0].produto_id).toBe(produtoBId)
  })

  it('lista cargas com o total calculado', async () => {
    await createCarga({
      fornecedor_id: fornecedorId,
      nome: 'Carga Para Total',
      data: '2026-09-04',
      itens: [{ produto_id: produtoAId, quantidade: 4, valor_unitario: 2.5 }],
    })

    const cargas = await listCargas('Carga Para Total')
    expect(cargas).toHaveLength(1)
    expect(cargas[0].total).toBe(10)
  })

  it('busca cargas pelo nome do fornecedor', async () => {
    await createCarga({
      fornecedor_id: fornecedorId,
      nome: 'Carga Qualquer',
      data: '2026-09-04',
      itens: [{ produto_id: produtoAId, quantidade: 1, valor_unitario: 1 }],
    })

    const resultados = await listCargas('Fornecedor Teste Carga')
    expect(resultados.some((c) => c.nome === 'Carga Qualquer')).toBe(true)
  })

  it('inativa e reativa uma carga', async () => {
    const { id } = await createCarga({
      fornecedor_id: fornecedorId,
      nome: 'Carga Toggle',
      data: '2026-09-04',
      itens: [{ produto_id: produtoAId, quantidade: 1, valor_unitario: 1 }],
    })

    await toggleCargaAtivo(id, false)
    let carga = await getCarga(id)
    expect(carga?.ativo).toBe(false)

    await toggleCargaAtivo(id, true)
    carga = await getCarga(id)
    expect(carga?.ativo).toBe(true)
  })

  it('rejeita chamadas de um usuário sem permissão de cargas', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listCargas()).rejects.toThrow('Acesso negado.')
  })
})
