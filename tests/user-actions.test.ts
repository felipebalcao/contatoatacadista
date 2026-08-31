import { describe, it, expect, afterEach } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createUser, listUsers } from '@/actions/user-actions'

// Nota: o domínio example.com (RFC 2606) declara um registro MX nulo
// (RFC 7505) e é rejeitado pela validação de email do Supabase Auth em
// produção (Cloud). Usamos teste.com, que já tem MX válido e é o mesmo
// domínio do usuário admin semeado no projeto (admin@teste.com).
const TEST_EMAIL = 'vendedor.teste@teste.com'

describe('user-actions', () => {
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
})
