import { listCodigosProdutos, importarProdutos } from '@/actions/produto-actions'
import type { CampoImportacao, ConfiguracaoImportacao } from '@/lib/importacao/tipos'
import type { ProdutoInput } from '@/lib/types/database'

const CAMPOS: CampoImportacao[] = [
  { chave: 'codigo', rotulo: 'Código', obrigatorio: true },
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
  { chave: 'unidade', rotulo: 'Unidade', obrigatorio: true },
  { chave: 'codigo_barras', rotulo: 'Código de barras', obrigatorio: false, apelidos: ['ean', 'codigo de barras'] },
  { chave: 'categoria', rotulo: 'Categoria', obrigatorio: false },
]

export function validarLinhaProduto(
  bruta: Record<string, string>
): { valores: ProdutoInput | null; mensagens: string[] } {
  const codigo = bruta.codigo.trim()
  const nome = bruta.nome.trim()
  const unidade = bruta.unidade.trim()

  const mensagens: string[] = []
  if (codigo === '') mensagens.push('Informe o código.')
  if (nome === '') mensagens.push('Informe o nome.')
  if (unidade === '') mensagens.push('Informe a unidade.')

  if (mensagens.length > 0) return { valores: null, mensagens }

  return {
    valores: {
      codigo,
      nome,
      unidade,
      codigo_barras: bruta.codigo_barras.trim() || null,
      categoria: bruta.categoria.trim() || null,
    },
    mensagens: [],
  }
}

export const configImportacaoProdutos: ConfiguracaoImportacao<ProdutoInput> = {
  tituloModulo: 'produtos',
  campos: CAMPOS,
  validarLinha: validarLinhaProduto,
  chaveUnica: (valores) => valores.codigo,
  listarChavesExistentes: listCodigosProdutos,
  importar: importarProdutos,
  linkListagem: '/produtos',
}
