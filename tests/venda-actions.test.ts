import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import { listVendas, createVenda, updateVenda, deleteVenda } from '@/actions/venda-actions'
import { listClientesAtivos } from '@/actions/carga-actions'
import type { VendaInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const DOCUMENTO_FORNECEDOR = '11144477735'
const DOCUMENTO_CLIENTE = '22233344456'
const CODIGO_PRODUTO = 'TESTE-VENDA-ACTION'

let fornecedorId: string
let clienteId: string
let produtoId: string
let cargaId: string

const VENDA_BASE: VendaInput = {
  cliente_id: '',
  data: '2026-09-21',
  notas_fiscais: ['NF-1', 'NF-2'],
  vendedor: 'João',
  empresa: 'Empresa X',
  tipo_comissao: 'percentual',
  comissao_percentual: 5,
  comissao_fixa: null,
  itens: [],
}

describe('venda-actions', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()
    const { data: fornecedor } = await supabase
      .from('fornecedores')
      .insert({ tipo: 'pf', documento: DOCUMENTO_FORNECEDOR, nome: 'Fornecedor Teste Venda Actions' })
      .select()
      .single()
    fornecedorId = fornecedor!.id

    const { data: cliente } = await supabase
      .from('clientes')
      .insert({ tipo: 'pf', documento: DOCUMENTO_CLIENTE, nome: 'Cliente Teste Venda Actions' })
      .select()
      .single()
    clienteId = cliente!.id

    const { data: produto } = await supabase
      .from('produtos')
      .insert({ codigo: CODIGO_PRODUTO, nome: 'Produto Teste Venda Actions', unidade: 'un' })
      .select()
      .single()
    produtoId = produto!.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('id', fornecedorId)
    await supabase.from('clientes').delete().eq('id', clienteId)
    await supabase.from('produtos').delete().eq('id', produtoId)
  })

  beforeEach(async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
    const supabase = createAdminClient()
    const { data } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })
    cargaId = data
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('cargas').delete().eq('id', cargaId)
  })

  it('lista clientes ativos', async () => {
    const clientes = await listClientesAtivos()
    expect(clientes.some((c) => c.id === clienteId)).toBe(true)
  })

  it('cria, lista, atualiza e exclui uma venda', async () => {
    const input: VendaInput = {
      ...VENDA_BASE,
      cliente_id: clienteId,
      itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    }

    const criada = await createVenda(cargaId, input)
    expect(criada.sucesso).toBe(true)
    if (!criada.sucesso) throw new Error('esperava sucesso')
    expect(criada.dados.notas_fiscais).toEqual(['NF-1', 'NF-2'])
    expect(criada.dados.itens).toHaveLength(1)

    const lista = await listVendas(cargaId)
    expect(lista.some((v) => v.id === criada.dados.id)).toBe(true)

    const atualizada = await updateVenda(criada.dados.id, cargaId, {
      ...input,
      itens: [{ produto_id: produtoId, quantidade: 5, preco_unitario: 8 }],
    })
    expect(atualizada.sucesso).toBe(true)
    if (!atualizada.sucesso) throw new Error('esperava sucesso')
    expect(atualizada.dados.itens[0].quantidade).toBe(5)

    const excluida = await deleteVenda(criada.dados.id)
    expect(excluida.sucesso).toBe(true)

    const listaFinal = await listVendas(cargaId)
    expect(listaFinal.some((v) => v.id === criada.dados.id)).toBe(false)
  })

  it('bloqueia venda com estoque insuficiente, devolvendo a mensagem do banco', async () => {
    const resultado = await createVenda(cargaId, {
      ...VENDA_BASE,
      cliente_id: clienteId,
      itens: [{ produto_id: produtoId, quantidade: 999, preco_unitario: 8 }],
    })

    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) throw new Error('esperava falha')
    expect(resultado.erro).toContain('Estoque insuficiente')
  })

  it('updateVenda com id inexistente retorna erro amigável', async () => {
    const resultado = await updateVenda('00000000-0000-0000-0000-000000000000', cargaId, {
      ...VENDA_BASE,
      cliente_id: clienteId,
      itens: [{ produto_id: produtoId, quantidade: 1, preco_unitario: 10 }],
    })
    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) throw new Error('esperava falha')
    expect(resultado.erro).toBe('Venda não encontrada.')
  })

  it('createVenda rejeita data inválida', async () => {
    const resultado = await createVenda(cargaId, {
      ...VENDA_BASE,
      cliente_id: clienteId,
      data: '',
      itens: [{ produto_id: produtoId, quantidade: 1, preco_unitario: 10 }],
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('createVenda rejeita venda sem itens', async () => {
    const resultado = await createVenda(cargaId, { ...VENDA_BASE, cliente_id: clienteId, itens: [] })
    expect(resultado.sucesso).toBe(false)
  })

  it('cria venda com múltiplos itens e comissão mista, e os dados voltam corretos', async () => {
    const supabase = createAdminClient()
    const { data: produto2 } = await supabase
      .from('produtos')
      .insert({ codigo: `TESTE-VENDA-ACTION-2-${Date.now()}`, nome: 'Produto 2 Teste', unidade: 'un' })
      .select()
      .single()
    // produto2 nasce com estoque zero (não entrou em nenhuma carga); precisa de estoque
    // suficiente para a venda abaixo poder debitar 1 unidade.
    await supabase.from('produtos').update({ estoque_atual: 5 }).eq('id', produto2!.id)

    const resultado = await createVenda(cargaId, {
      ...VENDA_BASE,
      cliente_id: clienteId,
      tipo_comissao: 'misto',
      comissao_percentual: 8,
      comissao_fixa: 20,
      itens: [
        { produto_id: produtoId, quantidade: 2, preco_unitario: 10 },
        { produto_id: produto2!.id, quantidade: 1, preco_unitario: 50 },
      ],
    })

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados.tipo_comissao).toBe('misto')
    expect(resultado.dados.comissao_percentual).toBe(8)
    expect(resultado.dados.comissao_fixa).toBe(20)
    expect(resultado.dados.itens).toHaveLength(2)

    await supabase.from('produtos').delete().eq('id', produto2!.id)
  })

  it('exclui venda inexistente retorna erro "não encontrada"', async () => {
    const resultado = await deleteVenda('00000000-0000-0000-0000-000000000000')

    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) throw new Error('esperava falha')
    expect(resultado.erro).toBe('Venda não encontrada.')
  })

  it('rejeita chamadas de um usuário sem permissão de cargas', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...ADMIN_PROFILE, permissions: ['dashboard'] } as never)

    await expect(listVendas(cargaId)).rejects.toThrow('Acesso negado.')
    await expect(listClientesAtivos()).rejects.toThrow('Acesso negado.')
  })
})
