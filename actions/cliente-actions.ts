'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import { normalizarDocumento, validarDocumento } from '@/lib/validation/documento'
import type { Cliente, ClienteInput } from '@/lib/types/database'
import type { LinhaParaImportar, ResultadoImportacao } from '@/lib/importacao/tipos'
import type { ResultadoAcao } from '@/lib/types/acao'

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

export async function listClientes(query?: string): Promise<Cliente[]> {
  await assertModuleAccess('clientes')
  const supabase = createAdminClient()
  let request = supabase.from('clientes').select('*').order('nome')

  if (query) {
    const documentoBusca = normalizarDocumento(query)
    const filtros = [`nome.ilike.${quotePostgrestValue(`%${query}%`)}`]
    if (documentoBusca) {
      filtros.push(`documento.ilike.%${documentoBusca}%`)
    }
    request = request.or(filtros.join(','))
  }

  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data ?? []) as Cliente[]
}

export async function getCliente(id: string): Promise<Cliente | null> {
  await assertModuleAccess('clientes')
  const supabase = createAdminClient()
  const { data } = await supabase.from('clientes').select('*').eq('id', id).single()
  return (data as Cliente) ?? null
}

export async function createCliente(input: ClienteInput): Promise<ResultadoAcao<Cliente>> {
  await assertModuleAccess('clientes')
  const documento = normalizarDocumento(input.documento)

  if (!validarDocumento(input.tipo, documento)) {
    return { sucesso: false, erro: 'Documento inválido.' }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      tipo: input.tipo,
      documento,
      nome: input.nome,
      nome_fantasia: input.nome_fantasia,
      telefone: input.telefone,
      email: input.email,
      endereco_rua: input.endereco_rua,
      endereco_numero: input.endereco_numero,
      endereco_bairro: input.endereco_bairro,
      endereco_cidade: input.endereco_cidade,
      endereco_uf: input.endereco_uf,
      endereco_cep: input.endereco_cep,
      observacoes: input.observacoes,
      codigo: input.codigo,
      inscricao_estadual: input.inscricao_estadual,
      contato: input.contato,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { sucesso: false, erro: 'Já existe um cliente cadastrado com esse documento.' }
    }
    return { sucesso: false, erro: error.message }
  }

  return { sucesso: true, dados: data as Cliente }
}

export async function updateCliente(id: string, input: ClienteInput): Promise<ResultadoAcao<Cliente>> {
  await assertModuleAccess('clientes')
  const documento = normalizarDocumento(input.documento)

  if (!validarDocumento(input.tipo, documento)) {
    return { sucesso: false, erro: 'Documento inválido.' }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('clientes')
    .update({
      tipo: input.tipo,
      documento,
      nome: input.nome,
      nome_fantasia: input.nome_fantasia,
      telefone: input.telefone,
      email: input.email,
      endereco_rua: input.endereco_rua,
      endereco_numero: input.endereco_numero,
      endereco_bairro: input.endereco_bairro,
      endereco_cidade: input.endereco_cidade,
      endereco_uf: input.endereco_uf,
      endereco_cep: input.endereco_cep,
      observacoes: input.observacoes,
      codigo: input.codigo,
      inscricao_estadual: input.inscricao_estadual,
      contato: input.contato,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { sucesso: false, erro: 'Já existe um cliente cadastrado com esse documento.' }
    }
    return { sucesso: false, erro: error.message }
  }

  return { sucesso: true, dados: data as Cliente }
}

export async function toggleClienteAtivo(id: string, ativo: boolean): Promise<ResultadoAcao> {
  await assertModuleAccess('clientes')
  const supabase = createAdminClient()
  const { error } = await supabase.from('clientes').update({ ativo }).eq('id', id)
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, dados: undefined }
}

export async function listDocumentosClientes(): Promise<string[]> {
  await assertModuleAccess('clientes')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('clientes').select('documento')
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => c.documento as string)
}

export async function importarClientes(
  linhas: LinhaParaImportar<ClienteInput>[]
): Promise<ResultadoImportacao> {
  await assertModuleAccess('clientes')
  let criados = 0
  const pulados: { linha: number; motivo: string }[] = []

  for (const linha of linhas) {
    try {
      const resultado = await createCliente(linha.valores)
      if (resultado.sucesso) {
        criados++
      } else {
        pulados.push({ linha: linha.numero, motivo: resultado.erro })
      }
    } catch (err) {
      pulados.push({ linha: linha.numero, motivo: err instanceof Error ? err.message : 'Erro desconhecido.' })
    }
  }

  return { criados, pulados }
}
