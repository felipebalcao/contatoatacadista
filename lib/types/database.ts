export type ModuleKey = 'dashboard' | 'cargas' | 'clientes' | 'produtos' | 'usuarios'

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
