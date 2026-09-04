import { describe, it, expect } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'

describe('createAdminClient', () => {
  it('lê os papéis semeados no banco local', async () => {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('roles')
      .select('nome, is_system, permissions_locked')
      .order('nome')

    expect(error).toBeNull()
    expect(data).toEqual([
      { nome: 'Admin', is_system: true, permissions_locked: true },
      { nome: 'Financeiro', is_system: true, permissions_locked: false },
    ])
  })

  it('concede ao papel Admin acesso ao módulo fornecedores', async () => {
    const supabase = createAdminClient()
    const { data: adminRole, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('nome', 'Admin')
      .single()

    expect(roleError).toBeNull()

    const { data, error } = await supabase
      .from('role_permissions')
      .select('module_key')
      .eq('role_id', adminRole!.id)
      .eq('module_key', 'fornecedores')

    expect(error).toBeNull()
    expect(data).toEqual([{ module_key: 'fornecedores' }])
  })
})
