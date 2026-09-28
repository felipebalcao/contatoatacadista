import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCarga, listCargas } from '@/actions/carga-actions'
import {
  listCustos,
  createCusto,
  updateCusto,
  deleteCusto,
  listPagamentos,
  createPagamento,
  updatePagamento,
  deletePagamento,
} from '@/actions/carga-lancamentos-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const DOCUMENTO_FORNECEDOR_TESTE = '99999999999'
const CODIGO_PRODUTO_TESTE = 'TESTE-LANC-A'
const NOME_FORNECEDOR_TESTE = 'Fornecedor Teste Lancamentos'
const ID_INEXISTENTE = '00000000-0000-0000-0000-000000000000'

let fornecedorId: string
let produtoId: string

async function criarCargaDeTeste(nome: string) {
  const { id } = await createCarga({
    fornecedor_id: fornecedorId,
    nome,
    data: '2026-09-20',
    itens: [{ produto_id: produtoId, quantidade: 4, valor_unitario: 2.5 }],
  })
  return id
}

describe('carga-lancamentos-actions', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()

    const { data: fornecedor, error: fornecedorError } = await supabase
      .from('fornecedores')
      .insert({ tipo: 'pf', documento: DOCUMENTO_FORNECEDOR_TESTE, nome: NOME_FORNECEDOR_TESTE })
      .select()
      .single()
    if (fornecedorError) throw fornecedorError
    fornecedorId = fornecedor.id

    const { data: produto, error: produtoError } = await supabase
      .from('produtos')
      .insert({ codigo: CODIGO_PRODUTO_TESTE, nome: 'Produto Teste Lancamentos', unidade: 'un' })
      .select()
      .single()
    if (produtoError) throw produtoError
    produtoId = produto.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('id', fornecedorId)
    await supabase.from('produtos').delete().eq('id', produtoId)
  })

  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('cargas').delete().eq('fornecedor_id', fornecedorId)
  })

  it('cria e lista um custo, aparando a categoria e guardando descrição vazia como null', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo')

    const custo = await createCusto(cargaId, {
      categoria: '  Transporte  ',
      descricao: '   ',
      valor: 150.5,
      data: '2026-09-20',
    })

    expect(custo.categoria).toBe('Transporte')
    expect(custo.descricao).toBeNull()
    expect(custo.valor).toBe(150.5)

    const custos = await listCustos(cargaId)
    expect(custos).toHaveLength(1)
    expect(custos[0].id).toBe(custo.id)
  })

  it('atualiza um custo', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Update')
    const custo = await createCusto(cargaId, { categoria: 'Descarga', descricao: null, valor: 50, data: '2026-09-20' })

    const atualizado = await updateCusto(custo.id, {
      categoria: 'Comissão',
      descricao: 'Vendedor João',
      valor: 75,
      data: '2026-09-21',
    })

    expect(atualizado.categoria).toBe('Comissão')
    expect(atualizado.descricao).toBe('Vendedor João')
    expect(atualizado.valor).toBe(75)
    expect(atualizado.data).toBe('2026-09-21')
  })

  it('exclui um custo', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Delete')
    const custo = await createCusto(cargaId, { categoria: 'Descarga', descricao: null, valor: 50, data: '2026-09-20' })

    await deleteCusto(custo.id)

    expect(await listCustos(cargaId)).toHaveLength(0)
  })

  it('rejeita custo com valor zero, negativo ou inválido', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Valor')
    const base = { categoria: 'Transporte', descricao: null, data: '2026-09-20' }

    await expect(createCusto(cargaId, { ...base, valor: 0 })).rejects.toThrow('Informe um valor maior que zero.')
    await expect(createCusto(cargaId, { ...base, valor: -5 })).rejects.toThrow('Informe um valor maior que zero.')
    await expect(createCusto(cargaId, { ...base, valor: Number.NaN })).rejects.toThrow('Informe um valor maior que zero.')
  })

  it('rejeita custo com categoria vazia ou data inválida', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Validacao')

    await expect(
      createCusto(cargaId, { categoria: '   ', descricao: null, valor: 10, data: '2026-09-20' })
    ).rejects.toThrow('Informe a categoria.')
    await expect(
      createCusto(cargaId, { categoria: 'Transporte', descricao: null, valor: 10, data: '2026-02-31' })
    ).rejects.toThrow('Informe uma data válida.')
    await expect(
      createCusto(cargaId, { categoria: 'Transporte', descricao: null, valor: 10, data: '20/09/2026' })
    ).rejects.toThrow('Informe uma data válida.')
  })

  it('cria, lista, atualiza e exclui um pagamento', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pagamento')

    const pagamento = await createPagamento(cargaId, { valor: 3, data: '2026-09-20', observacao: '  Pix  ' })
    expect(pagamento.observacao).toBe('Pix')

    const atualizado = await updatePagamento(pagamento.id, { valor: 4, data: '2026-09-21', observacao: null })
    expect(atualizado.valor).toBe(4)
    expect(atualizado.observacao).toBeNull()
    expect(await listPagamentos(cargaId)).toHaveLength(1)

    await deletePagamento(pagamento.id)
    expect(await listPagamentos(cargaId)).toHaveLength(0)
  })

  it('rejeita pagamento com valor ou data inválidos', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pagamento Validacao')

    await expect(
      createPagamento(cargaId, { valor: 0, data: '2026-09-20', observacao: null })
    ).rejects.toThrow('Informe um valor maior que zero.')
    await expect(
      createPagamento(cargaId, { valor: 10, data: 'ontem', observacao: null })
    ).rejects.toThrow('Informe uma data válida.')
  })

  it('listCargas devolve pago e falta calculados', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pago Falta')
    await createPagamento(cargaId, { valor: 3, data: '2026-09-20', observacao: null })
    await createCusto(cargaId, { categoria: 'Transporte', descricao: null, valor: 999, data: '2026-09-20' })

    const [carga] = await listCargas('Carga Pago Falta')

    expect(carga.total).toBe(10)
    expect(carga.pago).toBe(3)
    expect(carga.falta).toBe(7)
  })

  it('listCargas mostra falta negativa quando paga a mais', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pago A Mais')
    await createPagamento(cargaId, { valor: 12, data: '2026-09-20', observacao: null })

    const [carga] = await listCargas('Carga Pago A Mais')

    expect(carga.falta).toBe(-2)
  })

  it('devolve erro amigável para carga ou lançamento inexistente', async () => {
    await expect(
      createCusto(ID_INEXISTENTE, { categoria: 'Transporte', descricao: null, valor: 10, data: '2026-09-20' })
    ).rejects.toThrow('Carga não encontrada.')
    await expect(
      createPagamento(ID_INEXISTENTE, { valor: 10, data: '2026-09-20', observacao: null })
    ).rejects.toThrow('Carga não encontrada.')
    await expect(
      updateCusto(ID_INEXISTENTE, { categoria: 'Transporte', descricao: null, valor: 10, data: '2026-09-20' })
    ).rejects.toThrow('Lançamento não encontrado.')
    await expect(deleteCusto(ID_INEXISTENTE)).rejects.toThrow('Lançamento não encontrado.')
    await expect(deletePagamento(ID_INEXISTENTE)).rejects.toThrow('Lançamento não encontrado.')
  })

  it('rejeita chamadas de um usuário sem permissão de cargas', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listCustos(ID_INEXISTENTE)).rejects.toThrow('Acesso negado.')
    await expect(listPagamentos(ID_INEXISTENTE)).rejects.toThrow('Acesso negado.')
    await expect(
      createPagamento(ID_INEXISTENTE, { valor: 10, data: '2026-09-20', observacao: null })
    ).rejects.toThrow('Acesso negado.')
    await expect(deleteCusto(ID_INEXISTENTE)).rejects.toThrow('Acesso negado.')
  })
})
