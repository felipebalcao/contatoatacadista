'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import { calcularProximoCodigo } from '@/lib/produtos/proximo-codigo'
import type { Produto, ProdutoInput } from '@/lib/types/database'
import type { LinhaParaImportar, ResultadoImportacao } from '@/lib/importacao/tipos'
import type { ResultadoAcao } from '@/lib/types/acao'

const TAMANHO_PAGINA = 1000

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

export async function getProximoCodigoProduto(): Promise<string> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const codigos: string[] = []

  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from('produtos')
      .select('codigo')
      .filter('codigo', 'match', '^\\s*[0-9]{1,9}\\s*$')
      .order('id')
      .range(inicio, inicio + TAMANHO_PAGINA - 1)

    if (error) throw new Error(error.message)
    codigos.push(...(data ?? []).map((p) => p.codigo as string))
    if ((data ?? []).length < TAMANHO_PAGINA) break
  }

  return calcularProximoCodigo(codigos)
}

export async function getProduto(id: string): Promise<Produto | null> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data } = await supabase.from('produtos').select('*').eq('id', id).single()
  return (data as Produto) ?? null
}

export async function createProduto(input: ProdutoInput): Promise<ResultadoAcao<Produto>> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('produtos')
    .insert({
      codigo: input.codigo.trim(),
      codigo_barras: input.codigo_barras,
      nome: input.nome,
      unidade: input.unidade,
      categoria: input.categoria,
      referencia: input.referencia,
      ncm: input.ncm,
      codigo_anp: input.codigo_anp,
      cfop_dentro_estado: input.cfop_dentro_estado,
      cfop_fora_estado: input.cfop_fora_estado,
      cst_icms: input.cst_icms,
      aliquota_icms: input.aliquota_icms,
      cst_pis: input.cst_pis,
      aliquota_pis: input.aliquota_pis,
      cst_cofins: input.cst_cofins,
      aliquota_cofins: input.aliquota_cofins,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { sucesso: false, erro: 'Já existe um produto cadastrado com esse código.' }
    }
    return { sucesso: false, erro: error.message }
  }

  return { sucesso: true, dados: data as Produto }
}

export async function updateProduto(id: string, input: ProdutoInput): Promise<ResultadoAcao<Produto>> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('produtos')
    .update({
      codigo: input.codigo.trim(),
      codigo_barras: input.codigo_barras,
      nome: input.nome,
      unidade: input.unidade,
      categoria: input.categoria,
      referencia: input.referencia,
      ncm: input.ncm,
      codigo_anp: input.codigo_anp,
      cfop_dentro_estado: input.cfop_dentro_estado,
      cfop_fora_estado: input.cfop_fora_estado,
      cst_icms: input.cst_icms,
      aliquota_icms: input.aliquota_icms,
      cst_pis: input.cst_pis,
      aliquota_pis: input.aliquota_pis,
      cst_cofins: input.cst_cofins,
      aliquota_cofins: input.aliquota_cofins,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { sucesso: false, erro: 'Já existe um produto cadastrado com esse código.' }
    }
    return { sucesso: false, erro: error.message }
  }

  return { sucesso: true, dados: data as Produto }
}

export async function toggleProdutoAtivo(id: string, ativo: boolean): Promise<ResultadoAcao> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { error } = await supabase.from('produtos').update({ ativo }).eq('id', id)
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, dados: undefined }
}

export async function listCodigosProdutos(): Promise<string[]> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('produtos').select('codigo')
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => p.codigo as string)
}

export async function importarProdutos(
  linhas: LinhaParaImportar<ProdutoInput>[]
): Promise<ResultadoImportacao> {
  await assertModuleAccess('produtos')

  const codigosNoLote = new Set(linhas.map((l) => l.valores.codigo).filter((codigo) => codigo !== ''))
  let proximoCodigo = linhas.some((l) => l.valores.codigo === '')
    ? Number(await getProximoCodigoProduto())
    : null

  let criados = 0
  const pulados: { linha: number; motivo: string }[] = []

  for (const linha of linhas) {
    let valores = linha.valores

    if (valores.codigo === '') {
      while (codigosNoLote.has(String(proximoCodigo).padStart(4, '0'))) {
        proximoCodigo!++
      }
      const codigoGerado = String(proximoCodigo).padStart(4, '0')
      codigosNoLote.add(codigoGerado)
      proximoCodigo!++
      valores = { ...valores, codigo: codigoGerado }
    }

    try {
      const resultado = await createProduto(valores)
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
