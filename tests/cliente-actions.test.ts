import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createCliente,
  updateCliente,
  listClientes,
  toggleClienteAtivo,
} from '@/actions/cliente-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { ClienteInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'usuarios'] as const,
}

const DOCUMENTO_TESTE = '11144477735'

const inputBase: ClienteInput = {
  tipo: 'pf',
  documento: '111.444.777-35',
  nome: 'Cliente Teste',
  nome_fantasia: null,
  telefone: null,
  email: null,
  endereco_rua: null,
  endereco_numero: null,
  endereco_bairro: null,
  endereco_cidade: null,
  endereco_uf: null,
  endereco_cep: null,
  observacoes: null,
}

describe('cliente-actions', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('clientes').delete().eq('documento', DOCUMENTO_TESTE)
  })

  it('cria um cliente PF válido', async () => {
    const cliente = await createCliente(inputBase)

    expect(cliente.documento).toBe(DOCUMENTO_TESTE)
    expect(cliente.ativo).toBe(true)
  })

  it('rejeita documento com dígito verificador inválido', async () => {
    await expect(
      createCliente({ ...inputBase, documento: '111.444.777-36' })
    ).rejects.toThrow('Documento inválido.')
  })

  it('rejeita documento duplicado', async () => {
    await createCliente({ ...inputBase, nome: 'Primeiro Cadastro' })

    await expect(
      createCliente({ ...inputBase, nome: 'Segundo Cadastro' })
    ).rejects.toThrow('Já existe um cliente cadastrado com esse documento.')
  })

  it('atualiza um cliente existente', async () => {
    const cliente = await createCliente({ ...inputBase, nome: 'Nome Original' })

    const atualizado = await updateCliente(cliente.id, { ...inputBase, nome: 'Nome Atualizado' })

    expect(atualizado.nome).toBe('Nome Atualizado')
  })

  it('lista clientes filtrando por nome, excluindo os que não combinam', async () => {
    await createCliente({ ...inputBase, nome: 'Cliente Buscável' })
    await createCliente({
      ...inputBase,
      tipo: 'pj',
      documento: '11.222.333/0001-81',
      nome: 'Outra Empresa Qualquer',
    })

    const resultados = await listClientes('Buscável')

    expect(resultados.some((c) => c.documento === DOCUMENTO_TESTE)).toBe(true)
    expect(resultados.some((c) => c.documento === '11222333000181')).toBe(false)

    const supabase = createAdminClient()
    await supabase.from('clientes').delete().eq('documento', '11222333000181')
  })

  it('inativa e reativa um cliente', async () => {
    const cliente = await createCliente(inputBase)

    await toggleClienteAtivo(cliente.id, false)
    let lista = await listClientes()
    expect(lista.find((c) => c.id === cliente.id)?.ativo).toBe(false)

    await toggleClienteAtivo(cliente.id, true)
    lista = await listClientes()
    expect(lista.find((c) => c.id === cliente.id)?.ativo).toBe(true)
  })

  it('rejeita chamadas de um usuário sem permissão de clientes', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listClientes()).rejects.toThrow('Acesso negado.')
  })

  it('busca por nome contendo vírgula não quebra o filtro', async () => {
    await createCliente({ ...inputBase, nome: 'Cliente, Com Vírgula' })

    const resultados = await listClientes('Cliente, Com Vírgula')

    expect(resultados.some((c) => c.documento === DOCUMENTO_TESTE)).toBe(true)
  })
})
