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
})
