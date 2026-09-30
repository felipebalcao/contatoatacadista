import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRole, updateRolePermissions, deleteRole } from '@/actions/role-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'usuarios'] as const,
}

describe('role-actions (camada de dados, via admin client)', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('roles').delete().eq('nome', 'Vendedor Teste')
  })

  it('cria um papel personalizado com permissões', async () => {
    const resultado = await createRole('Vendedor Teste', ['clientes', 'produtos'])
    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados.nome).toBe('Vendedor Teste')
    expect(resultado.dados.is_system).toBe(false)

    const supabase = createAdminClient()
    const { data } = await supabase
      .from('role_permissions')
      .select('module_key')
      .eq('role_id', resultado.dados.id)
      .order('module_key')

    expect(data).toEqual([{ module_key: 'clientes' }, { module_key: 'produtos' }])
  })

  it('atualiza as permissões de um papel existente', async () => {
    const criado = await createRole('Vendedor Teste', ['clientes'])
    if (!criado.sucesso) throw new Error('esperava sucesso')
    const resultado = await updateRolePermissions(criado.dados.id, ['produtos', 'usuarios'])
    expect(resultado.sucesso).toBe(true)

    const supabase = createAdminClient()
    const { data } = await supabase
      .from('role_permissions')
      .select('module_key')
      .eq('role_id', criado.dados.id)
      .order('module_key')

    expect(data).toEqual([{ module_key: 'produtos' }, { module_key: 'usuarios' }])
  })

  it('exclui um papel personalizado sem usuários vinculados', async () => {
    const criado = await createRole('Vendedor Teste', [])
    if (!criado.sucesso) throw new Error('esperava sucesso')
    const resultado = await deleteRole(criado.dados.id)
    expect(resultado.sucesso).toBe(true)

    const supabase = createAdminClient()
    const { data } = await supabase.from('roles').select('id').eq('id', criado.dados.id)
    expect(data).toEqual([])
  })

  it('rejeita excluir um papel do sistema', async () => {
    const supabase = createAdminClient()
    const { data: adminRole } = await supabase.from('roles').select('id').eq('nome', 'Admin').single()

    const resultado = await deleteRole(adminRole!.id)
    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) throw new Error('esperava falha')
    expect(resultado.erro).toBe('Papéis do sistema não podem ser excluídos.')
  })

  it('rejeita chamadas de um usuário sem permissão de usuarios', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(createRole('Vendedor Teste', [])).rejects.toThrow('Acesso negado.')
  })
})
