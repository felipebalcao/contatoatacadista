'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import { extrairItensXml } from '@/lib/cargas/importar-xml-nfe'
import type { ResultadoAcao } from '@/lib/types/acao'

export interface ItemXmlNfe {
  codigo_barras: string | null
  descricao_xml: string
  quantidade: number | null
  valor_unitario: number | null
  produto_id: string | null
  produto_codigo: string | null
  produto_nome: string | null
  produto_unidade: string | null
  status: 'casado' | 'manual' | 'erro'
  mensagem_erro: string | null
}

export async function importarXmlNfe(xmlConteudo: string): Promise<ResultadoAcao<ItemXmlNfe[]>> {
  await assertModuleAccess('cargas')

  const extraido = extrairItensXml(xmlConteudo)
  if ('erro' in extraido) {
    return { sucesso: false, erro: extraido.erro }
  }

  const eans = extraido.itens
    .map((item) => item.codigo_barras)
    .filter((ean): ean is string => ean !== null)

  const produtosPorEan = new Map<string, { id: string; codigo: string; nome: string; unidade: string }[]>()

  if (eans.length > 0) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('produtos')
      .select('id, codigo, nome, unidade, codigo_barras')
      .in('codigo_barras', eans)
      .eq('ativo', true)

    if (error) return { sucesso: false, erro: error.message }

    for (const produto of data ?? []) {
      const chave = produto.codigo_barras as string
      const lista = produtosPorEan.get(chave) ?? []
      lista.push({ id: produto.id, codigo: produto.codigo, nome: produto.nome, unidade: produto.unidade })
      produtosPorEan.set(chave, lista)
    }
  }

  const itens: ItemXmlNfe[] = extraido.itens.map((item) => {
    if (item.erro) {
      return {
        codigo_barras: item.codigo_barras,
        descricao_xml: item.descricao_xml,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        produto_id: null,
        produto_codigo: null,
        produto_nome: null,
        produto_unidade: null,
        status: 'erro',
        mensagem_erro: item.erro,
      }
    }

    const candidatos = item.codigo_barras ? produtosPorEan.get(item.codigo_barras) ?? [] : []

    if (candidatos.length === 1) {
      const produto = candidatos[0]
      return {
        codigo_barras: item.codigo_barras,
        descricao_xml: item.descricao_xml,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        produto_id: produto.id,
        produto_codigo: produto.codigo,
        produto_nome: produto.nome,
        produto_unidade: produto.unidade,
        status: 'casado',
        mensagem_erro: null,
      }
    }

    return {
      codigo_barras: item.codigo_barras,
      descricao_xml: item.descricao_xml,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
      produto_id: null,
      produto_codigo: null,
      produto_nome: null,
      produto_unidade: null,
      status: 'manual',
      mensagem_erro: null,
    }
  })

  return { sucesso: true, dados: itens }
}
