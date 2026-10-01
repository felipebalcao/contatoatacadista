'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { ResultadoAcao } from '@/lib/types/acao'
import type { VendaComItens, VendaInput } from '@/lib/types/database'

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

function dataValida(data: string): boolean {
  if (!DATA_ISO.test(data)) return false
  const convertida = new Date(`${data}T00:00:00Z`)
  return !Number.isNaN(convertida.getTime()) && convertida.toISOString().slice(0, 10) === data
}

function textoOuNulo(texto: string | null): string | null {
  const limpo = texto?.trim() ?? ''
  return limpo === '' ? null : limpo
}

function validarVenda(input: VendaInput): VendaInput {
  if (!dataValida(input.data)) {
    throw new Error('Informe uma data válida.')
  }
  if (input.itens.length === 0) {
    throw new Error('Adicione pelo menos um produto à venda.')
  }
  if (
    (input.tipo_comissao === 'percentual' || input.tipo_comissao === 'misto') &&
    (input.comissao_percentual == null || !Number.isFinite(input.comissao_percentual) || input.comissao_percentual < 0)
  ) {
    throw new Error('Informe um percentual de comissão válido.')
  }
  if (
    (input.tipo_comissao === 'fixo' || input.tipo_comissao === 'misto') &&
    (input.comissao_fixa == null || !Number.isFinite(input.comissao_fixa) || input.comissao_fixa < 0)
  ) {
    throw new Error('Informe um valor de comissão fixa válido.')
  }
  return {
    ...input,
    vendedor: textoOuNulo(input.vendedor),
    empresa: textoOuNulo(input.empresa),
  }
}

function paraVendaComItens(row: {
  id: string
  carga_id: string
  cliente_id: string
  clientes: { nome: string } | null
  data: string
  notas_fiscais: string[]
  vendedor: string | null
  empresa: string | null
  tipo_comissao: VendaComItens['tipo_comissao']
  comissao_percentual: number | null
  comissao_fixa: number | null
  itens_venda: {
    id: string
    produto_id: string
    quantidade: number
    preco_unitario: number
    produtos: { codigo: string; nome: string; unidade: string } | null
  }[]
}): VendaComItens {
  return {
    id: row.id,
    carga_id: row.carga_id,
    cliente_id: row.cliente_id,
    cliente_nome: row.clientes?.nome ?? '',
    data: row.data,
    notas_fiscais: row.notas_fiscais,
    vendedor: row.vendedor,
    empresa: row.empresa,
    tipo_comissao: row.tipo_comissao,
    comissao_percentual: row.comissao_percentual,
    comissao_fixa: row.comissao_fixa,
    itens: row.itens_venda.map((item) => ({
      id: item.id,
      produto_id: item.produto_id,
      produto_codigo: item.produtos?.codigo ?? '',
      produto_nome: item.produtos?.nome ?? '',
      produto_unidade: item.produtos?.unidade ?? '',
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
    })),
  }
}

const SELECT_VENDA_COM_ITENS =
  '*, clientes(nome), itens_venda(id, produto_id, quantidade, preco_unitario, produtos(codigo, nome, unidade))'

export async function listVendas(cargaId: string): Promise<VendaComItens[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('vendas_carga')
    .select(SELECT_VENDA_COM_ITENS)
    .eq('carga_id', cargaId)
    .order('data', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => paraVendaComItens(row as never))
}

export async function createVenda(cargaId: string, input: VendaInput): Promise<ResultadoAcao<VendaComItens>> {
  await assertModuleAccess('cargas')
  let dados: VendaInput
  try {
    dados = validarVenda(input)
  } catch (err) {
    return { sucesso: false, erro: err instanceof Error ? err.message : 'Dados inválidos.' }
  }

  const supabase = createAdminClient()

  const { data: vendaId, error } = await supabase.rpc('criar_venda_com_itens', {
    p_carga_id: cargaId,
    p_cliente_id: dados.cliente_id,
    p_data: dados.data,
    p_notas_fiscais: dados.notas_fiscais,
    p_vendedor: dados.vendedor,
    p_empresa: dados.empresa,
    p_tipo_comissao: dados.tipo_comissao,
    p_comissao_percentual: dados.comissao_percentual,
    p_comissao_fixa: dados.comissao_fixa,
    p_itens: dados.itens,
  })

  if (error) {
    if (error.code === '23505') return { sucesso: false, erro: 'Não é possível adicionar o mesmo produto duas vezes na venda.' }
    if (error.code === '23503') return { sucesso: false, erro: 'Cliente ou carga não encontrados.' }
    return { sucesso: false, erro: error.message }
  }

  const { data: venda, error: buscaError } = await supabase
    .from('vendas_carga')
    .select(SELECT_VENDA_COM_ITENS)
    .eq('id', vendaId)
    .single()

  if (buscaError) return { sucesso: false, erro: buscaError.message }
  return { sucesso: true, dados: paraVendaComItens(venda as never) }
}

export async function updateVenda(
  id: string,
  cargaId: string,
  input: VendaInput
): Promise<ResultadoAcao<VendaComItens>> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()

  const { error: existeError } = await supabase
    .from('vendas_carga')
    .select('id')
    .eq('id', id)
    .eq('carga_id', cargaId)
    .single()
  if (existeError) return { sucesso: false, erro: 'Venda não encontrada.' }

  let dados: VendaInput
  try {
    dados = validarVenda(input)
  } catch (err) {
    return { sucesso: false, erro: err instanceof Error ? err.message : 'Dados inválidos.' }
  }

  const { error } = await supabase.rpc('atualizar_venda_com_itens', {
    p_venda_id: id,
    p_cliente_id: dados.cliente_id,
    p_data: dados.data,
    p_notas_fiscais: dados.notas_fiscais,
    p_vendedor: dados.vendedor,
    p_empresa: dados.empresa,
    p_tipo_comissao: dados.tipo_comissao,
    p_comissao_percentual: dados.comissao_percentual,
    p_comissao_fixa: dados.comissao_fixa,
    p_itens: dados.itens,
  })

  if (error) {
    if (error.code === '23505') return { sucesso: false, erro: 'Não é possível adicionar o mesmo produto duas vezes na venda.' }
    if (error.code === '23503') return { sucesso: false, erro: 'Cliente não encontrado.' }
    return { sucesso: false, erro: error.message }
  }

  const { data: venda, error: buscaError } = await supabase
    .from('vendas_carga')
    .select(SELECT_VENDA_COM_ITENS)
    .eq('id', id)
    .eq('carga_id', cargaId)
    .single()

  if (buscaError) return { sucesso: false, erro: 'Venda não encontrada.' }
  return { sucesso: true, dados: paraVendaComItens(venda as never) }
}

export async function deleteVenda(id: string): Promise<ResultadoAcao<void>> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()

  const { error: buscaError } = await supabase.from('vendas_carga').select('id').eq('id', id).single()
  if (buscaError) return { sucesso: false, erro: 'Venda não encontrada.' }

  const { error } = await supabase.rpc('deletar_venda_com_itens', { p_venda_id: id })
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, dados: undefined }
}
