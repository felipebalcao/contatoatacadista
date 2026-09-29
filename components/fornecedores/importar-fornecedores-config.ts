import { listDocumentosFornecedores, importarFornecedores } from '@/actions/fornecedor-actions'
import { normalizarDocumento, validarDocumento } from '@/lib/validation/documento'
import type { CampoImportacao, ConfiguracaoImportacao } from '@/lib/importacao/tipos'
import type { FornecedorInput } from '@/lib/types/database'

const CAMPOS: CampoImportacao[] = [
  { chave: 'documento', rotulo: 'Documento (CPF/CNPJ)', obrigatorio: true, apelidos: ['cpf', 'cnpj', 'cpf/cnpj'] },
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true, apelidos: ['razao social', 'razão social'] },
  { chave: 'nome_fantasia', rotulo: 'Nome fantasia', obrigatorio: false },
  { chave: 'telefone', rotulo: 'Telefone', obrigatorio: false },
  { chave: 'email', rotulo: 'Email', obrigatorio: false },
  { chave: 'endereco_rua', rotulo: 'Rua', obrigatorio: false },
  { chave: 'endereco_numero', rotulo: 'Número', obrigatorio: false },
  { chave: 'endereco_bairro', rotulo: 'Bairro', obrigatorio: false },
  { chave: 'endereco_cidade', rotulo: 'Cidade', obrigatorio: false },
  { chave: 'endereco_uf', rotulo: 'UF', obrigatorio: false },
  { chave: 'endereco_cep', rotulo: 'CEP', obrigatorio: false },
  { chave: 'observacoes', rotulo: 'Observações', obrigatorio: false },
]

export function validarLinhaFornecedor(
  bruta: Record<string, string>
): { valores: FornecedorInput | null; mensagens: string[] } {
  const nome = bruta.nome.trim()
  const documento = normalizarDocumento(bruta.documento)

  const mensagens: string[] = []
  if (nome === '') mensagens.push('Informe o nome.')

  const tipo = documento.length === 11 ? 'pf' : documento.length === 14 ? 'pj' : null
  if (!tipo || !validarDocumento(tipo, documento)) {
    mensagens.push('Documento inválido.')
  }

  if (mensagens.length > 0) return { valores: null, mensagens }

  return {
    valores: {
      tipo: tipo as 'pf' | 'pj',
      documento,
      nome,
      nome_fantasia: bruta.nome_fantasia.trim() || null,
      telefone: bruta.telefone.trim() || null,
      email: bruta.email.trim() || null,
      endereco_rua: bruta.endereco_rua.trim() || null,
      endereco_numero: bruta.endereco_numero.trim() || null,
      endereco_bairro: bruta.endereco_bairro.trim() || null,
      endereco_cidade: bruta.endereco_cidade.trim() || null,
      endereco_uf: bruta.endereco_uf.trim() || null,
      endereco_cep: bruta.endereco_cep.trim() || null,
      observacoes: bruta.observacoes.trim() || null,
    },
    mensagens: [],
  }
}

export const configImportacaoFornecedores: ConfiguracaoImportacao<FornecedorInput> = {
  tituloModulo: 'fornecedores',
  campos: CAMPOS,
  validarLinha: validarLinhaFornecedor,
  chaveUnica: (valores) => valores.documento,
  listarChavesExistentes: listDocumentosFornecedores,
  importar: importarFornecedores,
  linkListagem: '/fornecedores',
}
