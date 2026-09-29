import { describe, it, expect } from 'vitest'
import { detectarDuplicadas } from '@/lib/importacao/detectar-duplicadas'

describe('detectarDuplicadas', () => {
  it('marca como duplicada uma chave que já existe no banco', () => {
    expect(detectarDuplicadas(['111', '222'], ['111'])).toEqual([true, false])
  })

  it('marca como duplicada a segunda ocorrência da mesma chave dentro do próprio arquivo', () => {
    expect(detectarDuplicadas(['111', '111'], [])).toEqual([false, true])
  })

  it('linhas com chave null (erro de validação) nunca são marcadas como duplicadas', () => {
    expect(detectarDuplicadas([null, '111'], [])).toEqual([false, false])
  })

  it('não deixa uma chave já vista no arquivo mascarar a próxima ocorrência de uma chave diferente', () => {
    expect(detectarDuplicadas(['111', '222', '111'], [])).toEqual([false, false, true])
  })
})
