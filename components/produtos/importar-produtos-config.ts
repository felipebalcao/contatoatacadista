import { listCodigosProdutos, importarProdutos } from '@/actions/produto-actions'
import type { CampoImportacao, ConfiguracaoImportacao } from '@/lib/importacao/tipos'
import type { ProdutoInput } from '@/lib/types/database'

const CAMPOS: CampoImportacao[] = [
  { chave: 'codigo', rotulo: 'Código', obrigatorio: false },
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true, apelidos: ['descricao'] },
  { chave: 'unidade', rotulo: 'Unidade', obrigatorio: true, apelidos: ['unid', 'unid.'] },
  { chave: 'codigo_barras', rotulo: 'Código de barras', obrigatorio: false, apelidos: ['ean', 'codigo de barras'] },
  { chave: 'categoria', rotulo: 'Categoria', obrigatorio: false },
  { chave: 'referencia', rotulo: 'Referência', obrigatorio: false },
  { chave: 'ncm', rotulo: 'NCM', obrigatorio: false },
  { chave: 'codigo_anp', rotulo: 'Código ANP', obrigatorio: false },
  {
    chave: 'cfop',
    rotulo: 'CFOP (dentro/fora do estado)',
    obrigatorio: false,
    apelidos: ['cfop (j/f)', 'cfop j/f'],
  },
  { chave: 'cst_icms', rotulo: 'CST ICMS', obrigatorio: false },
  { chave: 'aliquota_icms', rotulo: 'Alíquota ICMS', obrigatorio: false, apelidos: ['aliq icms', 'aliq. icms'] },
  { chave: 'cst_pis', rotulo: 'CST PIS', obrigatorio: false },
  { chave: 'aliquota_pis', rotulo: 'Alíquota PIS', obrigatorio: false, apelidos: ['aliq pis', 'aliq. pis'] },
  { chave: 'cst_cofins', rotulo: 'CST COFINS', obrigatorio: false },
  {
    chave: 'aliquota_cofins',
    rotulo: 'Alíquota COFINS',
    obrigatorio: false,
    apelidos: ['aliq cofins', 'aliq. cofins'],
  },
]

/** Separa "5405 / 5405" em [dentro, fora]; com um valor só, usa o mesmo para os dois lados. */
function separarCfop(bruto: string): { dentroEstado: string | null; foraEstado: string | null } {
  const cfop = bruto.trim()
  if (cfop === '') return { dentroEstado: null, foraEstado: null }

  const partes = cfop
    .split('/')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '')

  return {
    dentroEstado: partes[0] ?? null,
    foraEstado: partes[1] ?? partes[0] ?? null,
  }
}

export function validarLinhaProduto(
  bruta: Record<string, string>
): { valores: ProdutoInput | null; mensagens: string[] } {
  const codigo = bruta.codigo.trim()
  const nome = bruta.nome.trim()
  const unidade = bruta.unidade.trim()

  const mensagens: string[] = []
  if (nome === '') mensagens.push('Informe o nome.')
  if (unidade === '') mensagens.push('Informe a unidade.')

  if (mensagens.length > 0) return { valores: null, mensagens }

  const { dentroEstado, foraEstado } = separarCfop(bruta.cfop)

  return {
    valores: {
      codigo,
      nome,
      unidade,
      codigo_barras: bruta.codigo_barras.trim() || null,
      categoria: bruta.categoria.trim() || null,
      referencia: bruta.referencia.trim() || null,
      ncm: bruta.ncm.trim() || null,
      codigo_anp: bruta.codigo_anp.trim() || null,
      cfop_dentro_estado: dentroEstado,
      cfop_fora_estado: foraEstado,
      cst_icms: bruta.cst_icms.trim() || null,
      aliquota_icms: bruta.aliquota_icms.trim() || null,
      cst_pis: bruta.cst_pis.trim() || null,
      aliquota_pis: bruta.aliquota_pis.trim() || null,
      cst_cofins: bruta.cst_cofins.trim() || null,
      aliquota_cofins: bruta.aliquota_cofins.trim() || null,
    },
    mensagens: [],
  }
}

export const configImportacaoProdutos: ConfiguracaoImportacao<ProdutoInput> = {
  tituloModulo: 'produtos',
  campos: CAMPOS,
  validarLinha: validarLinhaProduto,
  chaveUnica: (valores) => (valores.codigo === '' ? null : valores.codigo),
  listarChavesExistentes: listCodigosProdutos,
  importar: importarProdutos,
  linkListagem: '/produtos',
}
