import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createProduto } from '@/actions/produto-actions'
import { listCodigosProdutos, importarProdutos } from '@/actions/produto-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { LinhaParaImportar } from '@/lib/importacao/tipos'
import type { ProdutoInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const CODIGO_EXISTENTE = 'TESTE-IMPORT-A'
const CODIGO_NOVO = 'TESTE-IMPORT-B'

describe('importarProdutos / listCodigosProdutos', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('produtos').delete().in('codigo', [CODIGO_EXISTENTE, CODIGO_NOVO])
  })

  it('lista os códigos já cadastrados', async () => {
    await createProduto({ codigo: CODIGO_EXISTENTE, nome: 'Já Existe', unidade: 'un', codigo_barras: null, categoria: null })

    const codigos = await listCodigosProdutos()

    expect(codigos).toContain(CODIGO_EXISTENTE)
  })

  it('importa uma linha nova e pula uma linha com código já existente, sem alterar o cadastro existente', async () => {
    const original = await createProduto({
      codigo: CODIGO_EXISTENTE,
      nome: 'Nome Original',
      unidade: 'un',
      codigo_barras: null,
      categoria: null,
    })

    const linhas: LinhaParaImportar<ProdutoInput>[] = [
      { numero: 1, valores: { codigo: CODIGO_NOVO, nome: 'Produto Novo', unidade: 'un', codigo_barras: null, categoria: null } },
      { numero: 2, valores: { codigo: CODIGO_EXISTENTE, nome: 'Nome Tentando Sobrescrever', unidade: 'kg', codigo_barras: null, categoria: null } },
    ]

    const resultado = await importarProdutos(linhas)

    expect(resultado.criados).toBe(1)
    expect(resultado.pulados).toEqual([
      { linha: 2, motivo: 'Já existe um produto cadastrado com esse código.' },
    ])

    const supabase = createAdminClient()
    const { data: existente } = await supabase.from('produtos').select('nome, unidade').eq('id', original.id).single()
    expect(existente?.nome).toBe('Nome Original')
    expect(existente?.unidade).toBe('un')
  })

  it('rejeita chamadas de um usuário sem permissão de produtos', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...ADMIN_PROFILE, permissions: ['dashboard'] } as never)

    await expect(listCodigosProdutos()).rejects.toThrow('Acesso negado.')
    await expect(importarProdutos([])).rejects.toThrow('Acesso negado.')
  })
})
