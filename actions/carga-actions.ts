'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { CargaComItens, CargaInput, CargaResumo } from '@/lib/types/database'

export async function listCargas(query?: string): Promise<CargaResumo[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cargas')
    .select('id, nome, data, ativo, fornecedores(nome), itens_carga(quantidade, valor_unitario)')
    .order('data', { ascending: false })

  if (error) throw new Error(error.message)

  const cargas: CargaResumo[] = (data ?? []).map((c) => {
    const fornecedor = c.fornecedores as unknown as { nome: string } | null
    const itens = (c.itens_carga ?? []) as unknown as { quantidade: number; valor_unitario: number }[]
    return {
      id: c.id,
      nome: c.nome,
      data: c.data,
      ativo: c.ativo,
      fornecedor_nome: fornecedor?.nome ?? '',
      total: itens.reduce((soma, item) => soma + item.quantidade * item.valor_unitario, 0),
    }
  })

  if (!query) return cargas

  const termo = query.toLowerCase()
  return cargas.filter(
    (c) => c.nome.toLowerCase().includes(termo) || c.fornecedor_nome.toLowerCase().includes(termo)
  )
}

export async function getCarga(id: string): Promise<CargaComItens | null> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()

  const { data: carga } = await supabase
    .from('cargas')
    .select('id, fornecedor_id, nome, data, ativo, fornecedores(nome)')
    .eq('id', id)
    .single()

  if (!carga) return null

  const { data: itens, error } = await supabase
    .from('itens_carga')
    .select('id, produto_id, quantidade, valor_unitario, produtos(codigo, nome, unidade)')
    .eq('carga_id', id)

  if (error) throw new Error(error.message)

  const fornecedor = carga.fornecedores as unknown as { nome: string } | null

  return {
    id: carga.id,
    fornecedor_id: carga.fornecedor_id,
    fornecedor_nome: fornecedor?.nome ?? '',
    nome: carga.nome,
    data: carga.data,
    ativo: carga.ativo,
    itens: (itens ?? []).map((item) => {
      const produto = item.produtos as unknown as { codigo: string; nome: string; unidade: string }
      return {
        id: item.id,
        produto_id: item.produto_id,
        produto_codigo: produto.codigo,
        produto_nome: produto.nome,
        produto_unidade: produto.unidade,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
      }
    }),
  }
}

export async function createCarga(input: CargaInput): Promise<{ id: string }> {
  await assertModuleAccess('cargas')

  if (input.itens.length === 0) {
    throw new Error('A carga precisa ter pelo menos um produto.')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('criar_carga_com_itens', {
    p_fornecedor_id: input.fornecedor_id,
    p_nome: input.nome,
    p_data: input.data,
    p_itens: input.itens,
  })

  if (error) {
    if (error.code === '23505') {
      throw new Error('Não é possível adicionar o mesmo produto duas vezes na carga.')
    }
    throw new Error(error.message)
  }

  return { id: data as string }
}

export async function updateCarga(id: string, input: CargaInput): Promise<void> {
  await assertModuleAccess('cargas')

  if (input.itens.length === 0) {
    throw new Error('A carga precisa ter pelo menos um produto.')
  }

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('atualizar_carga_com_itens', {
    p_carga_id: id,
    p_fornecedor_id: input.fornecedor_id,
    p_nome: input.nome,
    p_data: input.data,
    p_itens: input.itens,
  })

  if (error) {
    if (error.code === '23505') {
      throw new Error('Não é possível adicionar o mesmo produto duas vezes na carga.')
    }
    throw new Error(error.message)
  }
}

export async function toggleCargaAtivo(id: string, ativo: boolean): Promise<void> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { error } = await supabase.from('cargas').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listFornecedoresAtivos(): Promise<{ id: string; nome: string }[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listProdutosAtivos(): Promise<{ id: string; codigo: string; nome: string; unidade: string }[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('produtos')
    .select('id, codigo, nome, unidade')
    .eq('ativo', true)
    .order('nome')
  if (error) throw new Error(error.message)
  return data ?? []
}
