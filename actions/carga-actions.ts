'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import { calcularResumoCarga } from '@/lib/cargas/resumo'
import type { CargaComItens, CargaInput, CargaResumo } from '@/lib/types/database'
import type { ResultadoAcao } from '@/lib/types/acao'

export async function listCargas(query?: string): Promise<CargaResumo[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cargas')
    .select('id, nome, data, ativo, fornecedores(nome), itens_carga(quantidade, valor_unitario), pagamentos_carga(valor)')
    .order('data', { ascending: false })

  if (error) throw new Error(error.message)

  const cargas: CargaResumo[] = (data ?? []).map((c) => {
    const fornecedor = c.fornecedores as unknown as { nome: string } | null
    const itens = (c.itens_carga ?? []) as unknown as { quantidade: number; valor_unitario: number }[]
    const pagamentos = (c.pagamentos_carga ?? []) as unknown as { valor: number }[]
    const resumo = calcularResumoCarga(itens, [], pagamentos)
    return {
      id: c.id,
      nome: c.nome,
      data: c.data,
      ativo: c.ativo,
      fornecedor_nome: fornecedor?.nome ?? '',
      total: resumo.custoTotal,
      pago: resumo.pago,
      falta: resumo.falta,
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

export async function createCarga(input: CargaInput): Promise<ResultadoAcao<{ id: string }>> {
  await assertModuleAccess('cargas')

  if (input.itens.length === 0) {
    return { sucesso: false, erro: 'A carga precisa ter pelo menos um produto.' }
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
      return { sucesso: false, erro: 'Não é possível adicionar o mesmo produto duas vezes na carga.' }
    }
    return { sucesso: false, erro: error.message }
  }

  return { sucesso: true, dados: { id: data as string } }
}

export async function updateCarga(id: string, input: CargaInput): Promise<ResultadoAcao> {
  await assertModuleAccess('cargas')

  if (input.itens.length === 0) {
    return { sucesso: false, erro: 'A carga precisa ter pelo menos um produto.' }
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
      return { sucesso: false, erro: 'Não é possível adicionar o mesmo produto duas vezes na carga.' }
    }
    return { sucesso: false, erro: error.message }
  }

  return { sucesso: true, dados: undefined }
}

export async function toggleCargaAtivo(id: string, ativo: boolean): Promise<ResultadoAcao> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { error } = await supabase.from('cargas').update({ ativo }).eq('id', id)
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, dados: undefined }
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

export async function listClientesAtivos(): Promise<{ id: string; nome: string }[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('clientes')
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
