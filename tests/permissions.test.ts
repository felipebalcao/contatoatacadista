import { describe, it, expect } from 'vitest'
import { MODULE_KEYS, hasModuleAccess } from '@/lib/auth/permissions'

describe('hasModuleAccess', () => {
  it('retorna true quando o módulo está na lista de permissões', () => {
    expect(hasModuleAccess(['dashboard', 'clientes'], 'clientes')).toBe(true)
  })

  it('retorna false quando o módulo não está na lista de permissões', () => {
    expect(hasModuleAccess(['dashboard'], 'usuarios')).toBe(false)
  })

  it('retorna false para lista de permissões vazia', () => {
    expect(hasModuleAccess([], 'dashboard')).toBe(false)
  })
})

describe('MODULE_KEYS', () => {
  it('contém exatamente os seis módulos desta fase, na ordem de navegação', () => {
    expect(MODULE_KEYS).toEqual(['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'])
  })
})
