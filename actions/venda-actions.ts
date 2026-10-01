'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { ResultadoAcao } from '@/lib/types/acao'
import type { VendaComItens, VendaInput } from '@/lib/types/database'

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
  const supabase = createAdminClient()

  const { data: vendaId, error } = await supabase.rpc('criar_venda_com_itens', {
    p_carga_id: cargaId,
    p_cliente_id: input.cliente_id,
    p_data: input.data,
    p_notas_fiscais: input.notas_fiscais,
    p_vendedor: input.vendedor,
    p_empresa: input.empresa,
    p_tipo_comissao: input.tipo_comissao,
    p_comissao_percentual: input.comissao_percentual,
    p_comissao_fixa: input.comissao_fixa,
    p_itens: input.itens,
  })

  if (error) {
    if (error.code === '23505') return { sucesso: false, erro: 'Não é possível adicionar o mesmo produto duas vezes na venda.' }
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

  const { error } = await supabase.rpc('atualizar_venda_com_itens', {
    p_venda_id: id,
    p_cliente_id: input.cliente_id,
    p_data: input.data,
    p_notas_fiscais: input.notas_fiscais,
    p_vendedor: input.vendedor,
    p_empresa: input.empresa,
    p_tipo_comissao: input.tipo_comissao,
    p_comissao_percentual: input.comissao_percentual,
    p_comissao_fixa: input.comissao_fixa,
    p_itens: input.itens,
  })

  if (error) {
    if (error.code === '23505') return { sucesso: false, erro: 'Não é possível adicionar o mesmo produto duas vezes na venda.' }
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
  const { error } = await supabase.rpc('deletar_venda_com_itens', { p_venda_id: id })
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, dados: undefined }
}
