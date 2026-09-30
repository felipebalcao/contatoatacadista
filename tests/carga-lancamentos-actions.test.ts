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
  const resultado = await createCarga({
    fornecedor_id: fornecedorId,
    nome,
    data: '2026-09-20',
    itens: [{ produto_id: produtoId, quantidade: 4, valor_unitario: 2.5 }],
  })
  if (!resultado.sucesso) throw new Error(resultado.erro)
  return resultado.dados.id
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

    const resultado = await createCusto(cargaId, {
      categoria: '  Transporte  ',
      descricao: '   ',
      valor: 150.5,
      data: '2026-09-20',
    })

    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados.categoria).toBe('Transporte')
    expect(resultado.dados.descricao).toBeNull()
    expect(resultado.dados.valor).toBe(150.5)

    const custos = await listCustos(cargaId)
    expect(custos).toHaveLength(1)
    expect(custos[0].id).toBe(resultado.dados.id)
  })

  it('atualiza um custo', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Update')
    const criado = await createCusto(cargaId, { categoria: 'Descarga', descricao: null, valor: 50, data: '2026-09-20' })
    if (!criado.sucesso) throw new Error('esperava sucesso')

    const resultado = await updateCusto(criado.dados.id, {
      categoria: 'Comissão',
      descricao: 'Vendedor João',
      valor: 75,
      data: '2026-09-21',
    })

    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados.categoria).toBe('Comissão')
    expect(resultado.dados.descricao).toBe('Vendedor João')
    expect(resultado.dados.valor).toBe(75)
    expect(resultado.dados.data).toBe('2026-09-21')
  })

  it('exclui um custo', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Delete')
    const criado = await createCusto(cargaId, { categoria: 'Descarga', descricao: null, valor: 50, data: '2026-09-20' })
    if (!criado.sucesso) throw new Error('esperava sucesso')

    const resultado = await deleteCusto(criado.dados.id)

    expect(resultado.sucesso).toBe(true)
    expect(await listCustos(cargaId)).toHaveLength(0)
  })

  it('rejeita custo com valor zero, negativo ou inválido', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Valor')
    const base = { categoria: 'Transporte', descricao: null, data: '2026-09-20' }

    const r1 = await createCusto(cargaId, { ...base, valor: 0 })
    expect(r1.sucesso).toBe(false)
    if (!r1.sucesso) expect(r1.erro).toBe('Informe um valor maior que zero.')

    const r2 = await createCusto(cargaId, { ...base, valor: -5 })
    expect(r2.sucesso).toBe(false)
    if (!r2.sucesso) expect(r2.erro).toBe('Informe um valor maior que zero.')

    const r3 = await createCusto(cargaId, { ...base, valor: Number.NaN })
    expect(r3.sucesso).toBe(false)
    if (!r3.sucesso) expect(r3.erro).toBe('Informe um valor maior que zero.')
  })

  it('rejeita custo com categoria vazia ou data inválida', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Validacao')

    const r1 = await createCusto(cargaId, { categoria: '   ', descricao: null, valor: 10, data: '2026-09-20' })
    expect(r1.sucesso).toBe(false)
    if (!r1.sucesso) expect(r1.erro).toBe('Informe a categoria.')

    const r2 = await createCusto(cargaId, { categoria: 'Transporte', descricao: null, valor: 10, data: '2026-02-31' })
    expect(r2.sucesso).toBe(false)
    if (!r2.sucesso) expect(r2.erro).toBe('Informe uma data válida.')

    const r3 = await createCusto(cargaId, { categoria: 'Transporte', descricao: null, valor: 10, data: '20/09/2026' })
    expect(r3.sucesso).toBe(false)
    if (!r3.sucesso) expect(r3.erro).toBe('Informe uma data válida.')
  })

  it('cria, lista, atualiza e exclui um pagamento', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pagamento')

    const criado = await createPagamento(cargaId, { valor: 3, data: '2026-09-20', observacao: '  Pix  ' })
    if (!criado.sucesso) throw new Error('esperava sucesso')
    expect(criado.dados.observacao).toBe('Pix')

    const atualizado = await updatePagamento(criado.dados.id, { valor: 4, data: '2026-09-21', observacao: null })
    if (!atualizado.sucesso) throw new Error('esperava sucesso')
    expect(atualizado.dados.valor).toBe(4)
    expect(atualizado.dados.observacao).toBeNull()
    expect(await listPagamentos(cargaId)).toHaveLength(1)

    const excluido = await deletePagamento(criado.dados.id)
    expect(excluido.sucesso).toBe(true)
    expect(await listPagamentos(cargaId)).toHaveLength(0)
  })

  it('rejeita pagamento com valor ou data inválidos', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pagamento Validacao')

    const r1 = await createPagamento(cargaId, { valor: 0, data: '2026-09-20', observacao: null })
    expect(r1.sucesso).toBe(false)
    if (!r1.sucesso) expect(r1.erro).toBe('Informe um valor maior que zero.')

    const r2 = await createPagamento(cargaId, { valor: 10, data: 'ontem', observacao: null })
    expect(r2.sucesso).toBe(false)
    if (!r2.sucesso) expect(r2.erro).toBe('Informe uma data válida.')
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
    const r1 = await createCusto(ID_INEXISTENTE, { categoria: 'Transporte', descricao: null, valor: 10, data: '2026-09-20' })
    expect(r1.sucesso).toBe(false)
    if (!r1.sucesso) expect(r1.erro).toBe('Carga não encontrada.')

    const r2 = await createPagamento(ID_INEXISTENTE, { valor: 10, data: '2026-09-20', observacao: null })
    expect(r2.sucesso).toBe(false)
    if (!r2.sucesso) expect(r2.erro).toBe('Carga não encontrada.')

    const r3 = await updateCusto(ID_INEXISTENTE, { categoria: 'Transporte', descricao: null, valor: 10, data: '2026-09-20' })
    expect(r3.sucesso).toBe(false)
    if (!r3.sucesso) expect(r3.erro).toBe('Lançamento não encontrado.')

    const r4 = await deleteCusto(ID_INEXISTENTE)
    expect(r4.sucesso).toBe(false)
    if (!r4.sucesso) expect(r4.erro).toBe('Lançamento não encontrado.')

    const r5 = await deletePagamento(ID_INEXISTENTE)
    expect(r5.sucesso).toBe(false)
    if (!r5.sucesso) expect(r5.erro).toBe('Lançamento não encontrado.')
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
