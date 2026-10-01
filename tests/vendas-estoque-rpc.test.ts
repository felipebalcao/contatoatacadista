import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'

const DOCUMENTO_FORNECEDOR = '11144477735'
const DOCUMENTO_CLIENTE = '22233344456'

let fornecedorId: string
let clienteId: string
const produtosCriados: string[] = []

async function criarProdutoTeste(): Promise<string> {
  const supabase = createAdminClient()
  const codigo = `TESTE-VENDA-${produtosCriados.length}-${Date.now()}`
  const { data } = await supabase
    .from('produtos')
    .insert({ codigo, nome: 'Produto Teste Vendas', unidade: 'un' })
    .select()
    .single()
  produtosCriados.push(data!.id)
  return data!.id
}

async function estoqueAtual(produtoId: string): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('produtos').select('estoque_atual').eq('id', produtoId).single()
  return Number(data?.estoque_atual ?? 0)
}

describe('funções de banco de vendas e estoque', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()
    const { data: fornecedor } = await supabase
      .from('fornecedores')
      .insert({ tipo: 'pf', documento: DOCUMENTO_FORNECEDOR, nome: 'Fornecedor Teste Vendas' })
      .select()
      .single()
    fornecedorId = fornecedor!.id

    const { data: cliente } = await supabase
      .from('clientes')
      .insert({ tipo: 'pf', documento: DOCUMENTO_CLIENTE, nome: 'Cliente Teste Vendas' })
      .select()
      .single()
    clienteId = cliente!.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('id', fornecedorId)
    await supabase.from('clientes').delete().eq('id', clienteId)
    if (produtosCriados.length > 0) {
      await supabase.from('produtos').delete().in('id', produtosCriados)
    }
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('cargas').delete().eq('fornecedor_id', fornecedorId)
  })

  it('criar carga soma a quantidade no estoque do produto', async () => {
    const produtoId = await criarProdutoTeste()
    const supabase = createAdminClient()
    await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })

    expect(await estoqueAtual(produtoId)).toBe(10)
  })

  it('editar carga ajusta o estoque pela diferença líquida', async () => {
    const produtoId = await criarProdutoTeste()
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })

    await supabase.rpc('atualizar_carga_com_itens', {
      p_carga_id: cargaId,
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 4, valor_unitario: 5 }],
    })

    expect(await estoqueAtual(produtoId)).toBe(4)
  })

  it('criar venda desconta o estoque', async () => {
    const produtoId = await criarProdutoTeste()
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })

    const { data: vendaId, error } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: ['123'],
      p_vendedor: 'João',
      p_empresa: 'Empresa X',
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    })

    expect(error).toBeNull()
    expect(vendaId).toBeTruthy()
    expect(await estoqueAtual(produtoId)).toBe(7)
  })

  it('bloqueia venda com quantidade maior que o estoque disponível, sem alterar o estoque', async () => {
    const produtoId = await criarProdutoTeste()
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 5, valor_unitario: 5 }],
    })

    const { error } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 999, preco_unitario: 8 }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('Estoque insuficiente')
    expect(await estoqueAtual(produtoId)).toBe(5)
  })

  it('editar venda ajusta o estoque pela diferença líquida', async () => {
    const produtoId = await criarProdutoTeste()
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })
    const { data: vendaId } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    })
    expect(await estoqueAtual(produtoId)).toBe(7)

    await supabase.rpc('atualizar_venda_com_itens', {
      p_venda_id: vendaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 6, preco_unitario: 8 }],
    })

    expect(await estoqueAtual(produtoId)).toBe(4)
  })

  it('excluir venda após edição devolve a quantidade atualizada, não a original', async () => {
    const produtoId = await criarProdutoTeste()
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })
    const { data: vendaId } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    })
    expect(await estoqueAtual(produtoId)).toBe(7)

    await supabase.rpc('atualizar_venda_com_itens', {
      p_venda_id: vendaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 6, preco_unitario: 8 }],
    })
    expect(await estoqueAtual(produtoId)).toBe(4)

    await supabase.rpc('deletar_venda_com_itens', { p_venda_id: vendaId })

    expect(await estoqueAtual(produtoId)).toBe(10)
  })

  it('atualizar venda com estoque insuficiente não altera o estoque (rollback completo)', async () => {
    const produtoId = await criarProdutoTeste()
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })
    const { data: vendaId } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    })
    expect(await estoqueAtual(produtoId)).toBe(7)

    const { error } = await supabase.rpc('atualizar_venda_com_itens', {
      p_venda_id: vendaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 999, preco_unitario: 8 }],
    })

    expect(error).not.toBeNull()
    expect(await estoqueAtual(produtoId)).toBe(7)
  })

  it('criar venda com produto inexistente levanta erro claro', async () => {
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [],
    })

    const { error } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: '00000000-0000-0000-0000-000000000000', quantidade: 1, preco_unitario: 10 }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('Produto não encontrado')
  })

  it('excluir venda devolve o estoque', async () => {
    const produtoId = await criarProdutoTeste()
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })
    const { data: vendaId } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    })
    expect(await estoqueAtual(produtoId)).toBe(7)

    await supabase.rpc('deletar_venda_com_itens', { p_venda_id: vendaId })

    expect(await estoqueAtual(produtoId)).toBe(10)
  })
})
