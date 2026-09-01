import { describe, it, expect, afterEach } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createCliente,
  updateCliente,
  listClientes,
  toggleClienteAtivo,
} from '@/actions/cliente-actions'
import type { ClienteInput } from '@/lib/types/database'

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

  it('lista clientes filtrando por nome', async () => {
    await createCliente({ ...inputBase, nome: 'Cliente Buscável' })

    const resultados = await listClientes('Buscável')
    expect(resultados.some((c) => c.documento === DOCUMENTO_TESTE)).toBe(true)
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
})
