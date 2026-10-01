export type ModuleKey = 'dashboard' | 'cargas' | 'clientes' | 'produtos' | 'fornecedores' | 'usuarios'

export interface Role {
  id: string
  nome: string
  is_system: boolean
  permissions_locked: boolean
  created_at: string
}

export interface Profile {
  id: string
  nome: string
  email: string
  role_id: string
  ativo: boolean
  created_at: string
}

export interface RolePermission {
  role_id: string
  module_key: ModuleKey
}

export type TipoCliente = 'pf' | 'pj'

export interface Cliente {
  id: string
  tipo: TipoCliente
  documento: string
  nome: string
  nome_fantasia: string | null
  telefone: string | null
  email: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  observacoes: string | null
  codigo: string | null
  inscricao_estadual: string | null
  contato: string | null
  ativo: boolean
  created_at: string
}

export interface ClienteInput {
  tipo: TipoCliente
  documento: string
  nome: string
  nome_fantasia: string | null
  telefone: string | null
  email: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  observacoes: string | null
  codigo: string | null
  inscricao_estadual: string | null
  contato: string | null
}

export interface Fornecedor {
  id: string
  tipo: TipoCliente
  documento: string
  nome: string
  nome_fantasia: string | null
  telefone: string | null
  email: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  observacoes: string | null
  codigo: string | null
  inscricao_estadual: string | null
  contato: string | null
  ativo: boolean
  created_at: string
}

export interface FornecedorInput {
  tipo: TipoCliente
  documento: string
  nome: string
  nome_fantasia: string | null
  telefone: string | null
  email: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  observacoes: string | null
  codigo: string | null
  inscricao_estadual: string | null
  contato: string | null
}

export interface Produto {
  id: string
  codigo: string
  codigo_barras: string | null
  nome: string
  unidade: string
  categoria: string | null
  referencia: string | null
  ncm: string | null
  codigo_anp: string | null
  cfop_dentro_estado: string | null
  cfop_fora_estado: string | null
  cst_icms: string | null
  aliquota_icms: string | null
  cst_pis: string | null
  aliquota_pis: string | null
  cst_cofins: string | null
  aliquota_cofins: string | null
  ativo: boolean
  created_at: string
  estoque_atual: number
}

export interface ProdutoInput {
  codigo: string
  codigo_barras: string | null
  nome: string
  unidade: string
  categoria: string | null
  referencia: string | null
  ncm: string | null
  codigo_anp: string | null
  cfop_dentro_estado: string | null
  cfop_fora_estado: string | null
  cst_icms: string | null
  aliquota_icms: string | null
  cst_pis: string | null
  aliquota_pis: string | null
  cst_cofins: string | null
  aliquota_cofins: string | null
}

export interface CargaResumo {
  id: string
  nome: string
  data: string
  ativo: boolean
  fornecedor_nome: string
  total: number
  pago: number
  falta: number
}

export interface ItemCarga {
  id: string
  produto_id: string
  produto_codigo: string
  produto_nome: string
  produto_unidade: string
  quantidade: number
  valor_unitario: number
}

export interface CargaComItens {
  id: string
  fornecedor_id: string
  fornecedor_nome: string
  nome: string
  data: string
  ativo: boolean
  itens: ItemCarga[]
}

export interface CargaInput {
  fornecedor_id: string
  nome: string
  data: string
  itens: { produto_id: string; quantidade: number; valor_unitario: number }[]
}

export interface Custo {
  id: string
  carga_id: string
  categoria: string
  descricao: string | null
  valor: number
  data: string
  created_at: string
}

export interface CustoInput {
  categoria: string
  descricao: string | null
  valor: number
  data: string
}

export interface Pagamento {
  id: string
  carga_id: string
  data: string
  valor: number
  observacao: string | null
  created_at: string
}

export interface PagamentoInput {
  valor: number
  data: string
  observacao: string | null
}

export type TipoComissao = 'percentual' | 'isento' | 'fixo' | 'misto'

export interface Venda {
  id: string
  carga_id: string
  cliente_id: string
  cliente_nome: string
  data: string
  notas_fiscais: string[]
  vendedor: string | null
  empresa: string | null
  tipo_comissao: TipoComissao
  comissao_percentual: number | null
  comissao_fixa: number | null
}

export interface ItemVenda {
  id: string
  produto_id: string
  produto_codigo: string
  produto_nome: string
  produto_unidade: string
  quantidade: number
  preco_unitario: number
}

export interface VendaComItens extends Venda {
  itens: ItemVenda[]
}

export interface VendaInput {
  cliente_id: string
  data: string
  notas_fiscais: string[]
  vendedor: string | null
  empresa: string | null
  tipo_comissao: TipoComissao
  comissao_percentual: number | null
  comissao_fixa: number | null
  itens: { produto_id: string; quantidade: number; preco_unitario: number }[]
}
