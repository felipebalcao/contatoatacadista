'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { Produto, ProdutoInput } from '@/lib/types/database'

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

export async function listProdutos(query?: string): Promise<Produto[]> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  let request = supabase.from('produtos').select('*').order('nome')

  if (query) {
    const valorBusca = quotePostgrestValue(`%${query}%`)
    request = request.or(`nome.ilike.${valorBusca},codigo.ilike.${valorBusca}`)
  }

  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data ?? []) as Produto[]
}

export async function getProduto(id: string): Promise<Produto | null> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data } = await supabase.from('produtos').select('*').eq('id', id).single()
  return (data as Produto) ?? null
}

export async function createProduto(input: ProdutoInput): Promise<Produto> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('produtos')
    .insert({
      codigo: input.codigo,
      codigo_barras: input.codigo_barras,
      nome: input.nome,
      unidade: input.unidade,
      categoria: input.categoria,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um produto cadastrado com esse código.')
    }
    throw new Error(error.message)
  }

  return data as Produto
}

export async function updateProduto(id: string, input: ProdutoInput): Promise<Produto> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('produtos')
    .update({
      codigo: input.codigo,
      codigo_barras: input.codigo_barras,
      nome: input.nome,
      unidade: input.unidade,
      categoria: input.categoria,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um produto cadastrado com esse código.')
    }
    throw new Error(error.message)
  }

  return data as Produto
}

export async function toggleProdutoAtivo(id: string, ativo: boolean): Promise<void> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { error } = await supabase.from('produtos').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}
