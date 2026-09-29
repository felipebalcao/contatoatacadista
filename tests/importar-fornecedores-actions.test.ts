import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createFornecedor, listDocumentosFornecedores, importarFornecedores } from '@/actions/fornecedor-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { LinhaParaImportar } from '@/lib/importacao/tipos'
import type { FornecedorInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const DOCUMENTO_EXISTENTE = '11144477735'
const DOCUMENTO_NOVO = '11222333000181'

const FORNECEDOR_BASE: FornecedorInput = {
  tipo: 'pf',
  documento: DOCUMENTO_EXISTENTE,
  nome: 'Fornecedor Teste',
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
  codigo: null,
  inscricao_estadual: null,
  contato: null,
}

describe('importarFornecedores / listDocumentosFornecedores', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().in('documento', [DOCUMENTO_EXISTENTE, DOCUMENTO_NOVO])
  })

  it('lista os documentos já cadastrados', async () => {
    await createFornecedor(FORNECEDOR_BASE)

    const documentos = await listDocumentosFornecedores()

    expect(documentos).toContain(DOCUMENTO_EXISTENTE)
  })

  it('importa uma linha nova e pula uma linha com documento já existente, sem alterar o cadastro existente', async () => {
    const original = await createFornecedor({ ...FORNECEDOR_BASE, nome: 'Nome Original' })

    const linhas: LinhaParaImportar<FornecedorInput>[] = [
      { numero: 1, valores: { ...FORNECEDOR_BASE, tipo: 'pj', documento: DOCUMENTO_NOVO, nome: 'Fornecedor Novo' } },
      { numero: 2, valores: { ...FORNECEDOR_BASE, nome: 'Nome Tentando Sobrescrever' } },
    ]

    const resultado = await importarFornecedores(linhas)

    expect(resultado.criados).toBe(1)
    expect(resultado.pulados).toEqual([
      { linha: 2, motivo: 'Já existe um fornecedor cadastrado com esse documento.' },
    ])

    const supabase = createAdminClient()
    const { data: existente } = await supabase.from('fornecedores').select('nome').eq('id', original.id).single()
    expect(existente?.nome).toBe('Nome Original')
  })

  it('rejeita chamadas de um usuário sem permissão de fornecedores', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...ADMIN_PROFILE, permissions: ['dashboard'] } as never)

    await expect(listDocumentosFornecedores()).rejects.toThrow('Acesso negado.')
    await expect(importarFornecedores([])).rejects.toThrow('Acesso negado.')
  })
})
