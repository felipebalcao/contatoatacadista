import { describe, it, expect, afterEach } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRole, updateRolePermissions, deleteRole } from '@/actions/role-actions'

describe('role-actions (camada de dados, via admin client)', () => {
  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('roles').delete().eq('nome', 'Vendedor Teste')
  })

  it('cria um papel personalizado com permissões', async () => {
    const role = await createRole('Vendedor Teste', ['clientes', 'produtos'])
    expect(role.nome).toBe('Vendedor Teste')
    expect(role.is_system).toBe(false)

    const supabase = createAdminClient()
    const { data } = await supabase
      .from('role_permissions')
      .select('module_key')
      .eq('role_id', role.id)
      .order('module_key')

    expect(data).toEqual([{ module_key: 'clientes' }, { module_key: 'produtos' }])
  })

  it('atualiza as permissões de um papel existente', async () => {
    const role = await createRole('Vendedor Teste', ['clientes'])
    await updateRolePermissions(role.id, ['produtos', 'usuarios'])

    const supabase = createAdminClient()
    const { data } = await supabase
      .from('role_permissions')
      .select('module_key')
      .eq('role_id', role.id)
      .order('module_key')

    expect(data).toEqual([{ module_key: 'produtos' }, { module_key: 'usuarios' }])
  })

  it('exclui um papel personalizado sem usuários vinculados', async () => {
    const role = await createRole('Vendedor Teste', [])
    await deleteRole(role.id)

    const supabase = createAdminClient()
    const { data } = await supabase.from('roles').select('id').eq('id', role.id)
    expect(data).toEqual([])
  })

  it('rejeita excluir um papel do sistema', async () => {
    const supabase = createAdminClient()
    const { data: adminRole } = await supabase.from('roles').select('id').eq('nome', 'Admin').single()

    await expect(deleteRole(adminRole!.id)).rejects.toThrow()
  })
})
