'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import { normalizarDocumento, validarDocumento } from '@/lib/validation/documento'
import type { Fornecedor, FornecedorInput } from '@/lib/types/database'
import type { LinhaParaImportar, ResultadoImportacao } from '@/lib/importacao/tipos'
import type { ResultadoAcao } from '@/lib/types/acao'

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

export async function listFornecedores(query?: string): Promise<Fornecedor[]> {
  await assertModuleAccess('fornecedores')
  const supabase = createAdminClient()
  let request = supabase.from('fornecedores').select('*').order('nome')

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
  return (data ?? []) as Fornecedor[]
}

export async function getFornecedor(id: string): Promise<Fornecedor | null> {
  await assertModuleAccess('fornecedores')
  const supabase = createAdminClient()
  const { data } = await supabase.from('fornecedores').select('*').eq('id', id).single()
  return (data as Fornecedor) ?? null
}

export async function createFornecedor(input: FornecedorInput): Promise<ResultadoAcao<Fornecedor>> {
  await assertModuleAccess('fornecedores')
  const documento = normalizarDocumento(input.documento)

  if (!validarDocumento(input.tipo, documento)) {
    return { sucesso: false, erro: 'Documento inválido.' }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('fornecedores')
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
      return { sucesso: false, erro: 'Já existe um fornecedor cadastrado com esse documento.' }
    }
    return { sucesso: false, erro: error.message }
  }

  return { sucesso: true, dados: data as Fornecedor }
}

export async function updateFornecedor(id: string, input: FornecedorInput): Promise<ResultadoAcao<Fornecedor>> {
  await assertModuleAccess('fornecedores')
  const documento = normalizarDocumento(input.documento)

  if (!validarDocumento(input.tipo, documento)) {
    return { sucesso: false, erro: 'Documento inválido.' }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('fornecedores')
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
      return { sucesso: false, erro: 'Já existe um fornecedor cadastrado com esse documento.' }
    }
    return { sucesso: false, erro: error.message }
  }

  return { sucesso: true, dados: data as Fornecedor }
}

export async function toggleFornecedorAtivo(id: string, ativo: boolean): Promise<ResultadoAcao> {
  await assertModuleAccess('fornecedores')
  const supabase = createAdminClient()
  const { error } = await supabase.from('fornecedores').update({ ativo }).eq('id', id)
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, dados: undefined }
}

export async function listDocumentosFornecedores(): Promise<string[]> {
  await assertModuleAccess('fornecedores')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('fornecedores').select('documento')
  if (error) throw new Error(error.message)
  return (data ?? []).map((f) => f.documento as string)
}

export async function importarFornecedores(
  linhas: LinhaParaImportar<FornecedorInput>[]
): Promise<ResultadoImportacao> {
  await assertModuleAccess('fornecedores')
  let criados = 0
  const pulados: { linha: number; motivo: string }[] = []

  for (const linha of linhas) {
    try {
      const resultado = await createFornecedor(linha.valores)
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
