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
}

export interface Produto {
  id: string
  codigo: string
  codigo_barras: string | null
  nome: string
  unidade: string
  categoria: string | null
  ativo: boolean
  created_at: string
}

export interface ProdutoInput {
  codigo: string
  codigo_barras: string | null
  nome: string
  unidade: string
  categoria: string | null
}

export interface CargaResumo {
  id: string
  nome: string
  data: string
  ativo: boolean
  fornecedor_nome: string
  total: number
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
