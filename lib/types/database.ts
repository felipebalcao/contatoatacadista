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
