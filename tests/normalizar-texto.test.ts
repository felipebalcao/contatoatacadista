import { describe, it, expect } from 'vitest'
import { normalizarTexto } from '@/lib/importacao/normalizar'

describe('normalizarTexto', () => {
  it('deixa minúsculo', () => {
    expect(normalizarTexto('NOME')).toBe('nome')
  })

  it('remove acentos', () => {
    expect(normalizarTexto('Razão Social')).toBe('razaosocial')
  })

  it('remove pontuação e espaços', () => {
    expect(normalizarTexto('CPF/CNPJ')).toBe('cpfcnpj')
  })

  it('remove BOM no início do texto', () => {
    expect(normalizarTexto('﻿Nome')).toBe('nome')
  })

  it('texto já normalizado permanece igual', () => {
    expect(normalizarTexto('telefone')).toBe('telefone')
  })
})
