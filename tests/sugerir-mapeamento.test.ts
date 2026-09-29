import { describe, it, expect } from 'vitest'
import { sugerirMapeamento } from '@/lib/importacao/sugerir-mapeamento'
import type { CampoImportacao } from '@/lib/importacao/tipos'

const CAMPOS: CampoImportacao[] = [
  { chave: 'documento', rotulo: 'Documento (CPF/CNPJ)', obrigatorio: true, apelidos: ['cpf', 'cnpj', 'cpf/cnpj'] },
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
  { chave: 'telefone', rotulo: 'Telefone', obrigatorio: false },
]

describe('sugerirMapeamento', () => {
  it('casa pelo rótulo exato, ignorando acento/maiúscula', () => {
    expect(sugerirMapeamento(['nome', 'TELEFONE'], CAMPOS)).toEqual({ nome: 'nome', telefone: 'TELEFONE' })
  })

  it('casa por apelido', () => {
    expect(sugerirMapeamento(['CPF/CNPJ'], CAMPOS)).toEqual({ documento: 'CPF/CNPJ' })
  })

  it('ignora colunas sem correspondência e campos sem coluna', () => {
    expect(sugerirMapeamento(['Coluna Desconhecida'], CAMPOS)).toEqual({})
  })

  it('não sugere nada para um campo cujo BOM/pontuação da coluna também não bate', () => {
    expect(sugerirMapeamento(['﻿Nome'], CAMPOS)).toEqual({ nome: '﻿Nome' })
  })
})
