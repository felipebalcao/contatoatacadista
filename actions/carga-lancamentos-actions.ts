'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { Custo, CustoInput, Pagamento, PagamentoInput } from '@/lib/types/database'

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
const NAO_ENCONTRADO = 'Lançamento não encontrado.'

function dataValida(data: string): boolean {
  if (!DATA_ISO.test(data)) return false
  const convertida = new Date(`${data}T00:00:00Z`)
  return !Number.isNaN(convertida.getTime()) && convertida.toISOString().slice(0, 10) === data
}

function validarValorEData(valor: number, data: string) {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Informe um valor maior que zero.')
  }
  if (!dataValida(data)) {
    throw new Error('Informe uma data válida.')
  }
}

function textoOuNulo(texto: string | null): string | null {
  const limpo = texto?.trim() ?? ''
  return limpo === '' ? null : limpo
}

function validarCusto(input: CustoInput): CustoInput {
  const categoria = input.categoria.trim()
  if (categoria === '') {
    throw new Error('Informe a categoria.')
  }
  validarValorEData(input.valor, input.data)
  return { categoria, descricao: textoOuNulo(input.descricao), valor: input.valor, data: input.data }
}

function validarPagamento(input: PagamentoInput): PagamentoInput {
  validarValorEData(input.valor, input.data)
  return { valor: input.valor, data: input.data, observacao: textoOuNulo(input.observacao) }
}

export async function listCustos(cargaId: string): Promise<Custo[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('custos_carga')
    .select('*')
    .eq('carga_id', cargaId)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Custo[]
}

export async function createCusto(cargaId: string, input: CustoInput): Promise<Custo> {
  await assertModuleAccess('cargas')
  const dados = validarCusto(input)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('custos_carga')
    .insert({
      carga_id: cargaId,
      categoria: dados.categoria,
      descricao: dados.descricao,
      valor: dados.valor,
      data: dados.data,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23503') throw new Error('Carga não encontrada.')
    throw new Error(error.message)
  }
  return data as Custo
}

export async function updateCusto(id: string, input: CustoInput): Promise<Custo> {
  await assertModuleAccess('cargas')
  const dados = validarCusto(input)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('custos_carga')
    .update({
      categoria: dados.categoria,
      descricao: dados.descricao,
      valor: dados.valor,
      data: dados.data,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new Error(NAO_ENCONTRADO)
    throw new Error(error.message)
  }
  return data as Custo
}

export async function deleteCusto(id: string): Promise<void> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('custos_carga').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error(NAO_ENCONTRADO)
}

export async function listPagamentos(cargaId: string): Promise<Pagamento[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagamentos_carga')
    .select('*')
    .eq('carga_id', cargaId)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Pagamento[]
}

export async function createPagamento(cargaId: string, input: PagamentoInput): Promise<Pagamento> {
  await assertModuleAccess('cargas')
  const dados = validarPagamento(input)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagamentos_carga')
    .insert({
      carga_id: cargaId,
      valor: dados.valor,
      data: dados.data,
      observacao: dados.observacao,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23503') throw new Error('Carga não encontrada.')
    throw new Error(error.message)
  }
  return data as Pagamento
}

export async function updatePagamento(id: string, input: PagamentoInput): Promise<Pagamento> {
  await assertModuleAccess('cargas')
  const dados = validarPagamento(input)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagamentos_carga')
    .update({
      valor: dados.valor,
      data: dados.data,
      observacao: dados.observacao,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new Error(NAO_ENCONTRADO)
    throw new Error(error.message)
  }
  return data as Pagamento
}

export async function deletePagamento(id: string): Promise<void> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('pagamentos_carga').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error(NAO_ENCONTRADO)
}
