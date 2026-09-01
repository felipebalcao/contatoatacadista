'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarDocumento, validarDocumento } from '@/lib/validation/documento'
import type { Cliente, ClienteInput } from '@/lib/types/database'

export async function listClientes(query?: string): Promise<Cliente[]> {
  const supabase = createAdminClient()
  let request = supabase.from('clientes').select('*').order('nome')

  if (query) {
    const documentoBusca = normalizarDocumento(query)
    request = request.or(`nome.ilike.%${query}%,documento.ilike.%${documentoBusca}%`)
  }

  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data ?? []) as Cliente[]
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('clientes').select('*').eq('id', id).single()
  return (data as Cliente) ?? null
}

export async function createCliente(input: ClienteInput): Promise<Cliente> {
  const documento = normalizarDocumento(input.documento)

  if (!validarDocumento(input.tipo, documento)) {
    throw new Error('Documento inválido.')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('clientes')
    .insert({ ...input, documento })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um cliente cadastrado com esse documento.')
    }
    throw new Error(error.message)
  }

  return data as Cliente
}

export async function updateCliente(id: string, input: ClienteInput): Promise<Cliente> {
  const documento = normalizarDocumento(input.documento)

  if (!validarDocumento(input.tipo, documento)) {
    throw new Error('Documento inválido.')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('clientes')
    .update({ ...input, documento })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um cliente cadastrado com esse documento.')
    }
    throw new Error(error.message)
  }

  return data as Cliente
}

export async function toggleClienteAtivo(id: string, ativo: boolean): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('clientes').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}
