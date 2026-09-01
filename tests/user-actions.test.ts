import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createUser, listUsers } from '@/actions/user-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'usuarios'] as const,
}

// Nota: o domínio example.com (RFC 2606) declara um registro MX nulo
// (RFC 7505) e é rejeitado pela validação de email do Supabase Auth em
// produção (Cloud). Usamos teste.com, que já tem MX válido e é o mesmo
// domínio do usuário admin semeado no projeto (admin@teste.com).
const TEST_EMAIL = 'vendedor.teste@teste.com'

describe('user-actions', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    const { data } = await supabase.auth.admin.listUsers()
    const user = data.users.find((u) => u.email === TEST_EMAIL)
    if (user) await supabase.auth.admin.deleteUser(user.id)
  })

  it('cria o usuário no Auth e o profile vinculado ao papel', async () => {
    const supabase = createAdminClient()
    const { data: financeiro } = await supabase.from('roles').select('id').eq('nome', 'Financeiro').single()

    const profile = await createUser('Vendedor Teste', TEST_EMAIL, financeiro!.id)

    expect(profile.email).toBe(TEST_EMAIL)
    expect(profile.role_id).toBe(financeiro!.id)

    const { data: authUser } = await supabase.auth.admin.listUsers()
    expect(authUser.users.some((u) => u.email === TEST_EMAIL)).toBe(true)
  })

  it('lista usuários com nome do papel', async () => {
    const supabase = createAdminClient()
    const { data: financeiro } = await supabase.from('roles').select('id').eq('nome', 'Financeiro').single()
    await createUser('Vendedor Teste', TEST_EMAIL, financeiro!.id)

    const users = await listUsers()
    const created = users.find((u) => u.email === TEST_EMAIL)

    expect(created?.role.nome).toBe('Financeiro')
  })

  it('rejeita chamadas de um usuário sem permissão de usuarios', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listUsers()).rejects.toThrow('Acesso negado.')
  })
})
