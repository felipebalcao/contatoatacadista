# Importar XML da NF-e Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir importar os itens de uma carga a partir do XML de uma NF-e de compra, casando cada item por código de barras com um produto já cadastrado, com uma tela de revisão antes de confirmar.

**Architecture:** Uma função pura de parsing do XML (sem banco), uma Server Action que usa essa função e consulta `produtos` por código de barras, uma função pura de mesclagem (soma quantidades de produtos já presentes na lista da carga), e um modal de 2 passos (upload → revisão) que alimenta a mesma lista `itens` já usada pelo resto do formulário de carga. Nenhuma escrita no banco acontece na importação — só quando o usuário salva a carga, pelo fluxo atômico já existente.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 (strict), `fast-xml-parser` (nova dependência), Tailwind + shadcn/ui, Supabase Postgres, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-01-importar-xml-nfe-design.md](../specs/2026-10-01-importar-xml-nfe-design.md)

## Global Constraints

- Segue a stack e convenções já estabelecidas: Next.js App Router, TypeScript `strict`, Tailwind + shadcn/ui, Vitest, npm.
- Nenhuma criação de produto a partir do XML — só vincula a produtos já cadastrados e ativos.
- Nenhuma alteração no schema do banco — esta feature não precisa de migração nenhuma.
- A Server Action chama `assertModuleAccess('cargas')` como primeira linha, igual às outras ações deste módulo. Erros esperados (arquivo inválido, XML que não é NF-e, nota sem itens) voltam como `ResultadoAcao<T>` (`{ sucesso: false; erro: string }`), nunca como exceção lançada.
- Nenhum item entra na carga pela metade: a confirmação da importação só é permitida quando toda linha tem produto selecionado e valores válidos.
- `produtos.codigo_barras` não tem `unique` no banco — duas linhas podem ter o mesmo valor; quando isso acontece, nenhuma é escolhida automaticamente (ambíguo cai pra seleção manual).

## Review Focus

- Uma nota com exatamente 1 item: a biblioteca `fast-xml-parser` colapsa uma tag repetível em objeto único (não array) quando só aparece uma vez, a menos que configurada explicitamente — sem o `isArray` certo, uma nota de 1 item perderia o item silenciosamente.
- Código de barras com zero à esquerda (ex: `"0123456789012"`): a conversão automática de texto-pra-número do parser pode truncar o zero, corrompendo o casamento por EAN sem gerar erro nenhum.
- Dois produtos cadastrados com o mesmo código de barras (sem `unique` no banco): o casamento automático nunca pode escolher um dos dois arbitrariamente.
- Produto inativo com código de barras correspondente: não deve casar automaticamente, mesma regra já usada em `listProdutosAtivos`.
- O mesmo produto aparecendo duas vezes na mesma importação (duplicado dentro do próprio XML, ou já presente na lista atual da carga): a mesclagem precisa somar corretamente nos dois casos, sem duplicar a linha (o que violaria o `unique(carga_id, produto_id)` só na hora de salvar a carga, um erro tardio e confuso).

---

### Task 1: Parsing puro do XML da NF-e

**Files:**
- Create: `lib/cargas/importar-xml-nfe.ts`
- Test: `lib/cargas/importar-xml-nfe.test.ts`
- Modify: `package.json` (nova dependência)

**Interfaces:**
- Produces: `export interface ItemExtraidoXml { codigo_barras: string | null; descricao_xml: string; quantidade: number | null; valor_unitario: number | null; erro: string | null }` e `export function extrairItensXml(xmlConteudo: string): { itens: ItemExtraidoXml[] } | { erro: string }` — consumido pela Task 2.

- [ ] **Step 1: Instalar a dependência**

Run: `npm install fast-xml-parser`

- [ ] **Step 2: Escrever os testes em `lib/cargas/importar-xml-nfe.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { extrairItensXml } from './importar-xml-nfe'

const XML_NFE_PROC_DOIS_ITENS = `<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe1" versao="4.00">
      <det nItem="1">
        <prod>
          <cProd>001</cProd>
          <cEAN>7891000100103</cEAN>
          <xProd>ARROZ TIPO 1 5KG</xProd>
          <qCom>10.0000</qCom>
          <vUnCom>25.5000</vUnCom>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>002</cProd>
          <cEAN>7891000200104</cEAN>
          <xProd>FEIJAO CARIOCA 1KG</xProd>
          <qCom>20.0000</qCom>
          <vUnCom>8.9000</vUnCom>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`

const XML_NFE_SOLTA_UM_ITEM = `<NFe>
  <infNFe Id="NFe2" versao="4.00">
    <det nItem="1">
      <prod>
        <cProd>003</cProd>
        <cEAN>7891000300105</cEAN>
        <xProd>ACUCAR REFINADO 1KG</xProd>
        <qCom>15.0000</qCom>
        <vUnCom>4.2000</vUnCom>
      </prod>
    </det>
  </infNFe>
</NFe>`

const XML_SEM_INFNFE = `<algumaCoisa>
  <outraTag>conteudo</outraTag>
</algumaCoisa>`

const XML_INFNFE_SEM_DET = `<NFe>
  <infNFe Id="NFe4" versao="4.00">
    <ide><nNF>123</nNF></ide>
  </infNFe>
</NFe>`

const XML_CEAN_AUSENTE_E_SEM_GTIN = `<NFe>
  <infNFe Id="NFe5" versao="4.00">
    <det nItem="1">
      <prod>
        <cProd>004</cProd>
        <xProd>PRODUTO SEM CODIGO DE BARRAS</xProd>
        <qCom>1.0000</qCom>
        <vUnCom>10.0000</vUnCom>
      </prod>
    </det>
    <det nItem="2">
      <prod>
        <cProd>005</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>OUTRO PRODUTO SEM EAN</xProd>
        <qCom>2.0000</qCom>
        <vUnCom>5.0000</vUnCom>
      </prod>
    </det>
  </infNFe>
</NFe>`

const XML_QCOM_INVALIDO_NUMA_LINHA = `<NFe>
  <infNFe Id="NFe6" versao="4.00">
    <det nItem="1">
      <prod>
        <cProd>006</cProd>
        <cEAN>7891000600106</cEAN>
        <xProd>PRODUTO COM QUANTIDADE INVALIDA</xProd>
        <qCom></qCom>
        <vUnCom>10.0000</vUnCom>
      </prod>
    </det>
    <det nItem="2">
      <prod>
        <cProd>007</cProd>
        <cEAN>7891000700107</cEAN>
        <xProd>PRODUTO OK</xProd>
        <qCom>3.0000</qCom>
        <vUnCom>7.0000</vUnCom>
      </prod>
    </det>
  </infNFe>
</NFe>`

const XML_CEAN_COM_ZERO_A_ESQUERDA = `<NFe>
  <infNFe Id="NFe7" versao="4.00">
    <det nItem="1">
      <prod>
        <cProd>008</cProd>
        <cEAN>0123456789012</cEAN>
        <xProd>PRODUTO COM EAN COMECANDO EM ZERO</xProd>
        <qCom>1.0000</qCom>
        <vUnCom>1.0000</vUnCom>
      </prod>
    </det>
  </infNFe>
</NFe>`

const XML_MALFORMADO = `<NFe><infNFe>texto sem fechar as tags corretamente`

describe('extrairItensXml', () => {
  it('extrai os itens de um XML com wrapper nfeProc e 2 itens', () => {
    const resultado = extrairItensXml(XML_NFE_PROC_DOIS_ITENS)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens).toHaveLength(2)
    expect(resultado.itens[0]).toEqual({
      codigo_barras: '7891000100103',
      descricao_xml: 'ARROZ TIPO 1 5KG',
      quantidade: 10,
      valor_unitario: 25.5,
      erro: null,
    })
    expect(resultado.itens[1].codigo_barras).toBe('7891000200104')
  })

  it('extrai corretamente uma NFe solta (sem nfeProc) com exatamente 1 item', () => {
    const resultado = extrairItensXml(XML_NFE_SOLTA_UM_ITEM)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens).toHaveLength(1)
    expect(resultado.itens[0].codigo_barras).toBe('7891000300105')
    expect(resultado.itens[0].quantidade).toBe(15)
  })

  it('retorna erro quando o XML não tem infNFe', () => {
    const resultado = extrairItensXml(XML_SEM_INFNFE)
    expect(resultado).toEqual({ erro: 'Este arquivo não parece ser o XML de uma NF-e.' })
  })

  it('retorna erro quando infNFe não tem nenhum det', () => {
    const resultado = extrairItensXml(XML_INFNFE_SEM_DET)
    expect(resultado).toEqual({ erro: 'Esta nota não tem itens para importar.' })
  })

  it('trata cEAN ausente e "SEM GTIN" como código de barras nulo', () => {
    const resultado = extrairItensXml(XML_CEAN_AUSENTE_E_SEM_GTIN)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens[0].codigo_barras).toBeNull()
    expect(resultado.itens[1].codigo_barras).toBeNull()
  })

  it('marca erro só na linha com quantidade inválida, sem afetar as outras', () => {
    const resultado = extrairItensXml(XML_QCOM_INVALIDO_NUMA_LINHA)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens).toHaveLength(2)
    expect(resultado.itens[0].erro).toBe('Quantidade ou valor unitário inválido nesta linha.')
    expect(resultado.itens[1].erro).toBeNull()
    expect(resultado.itens[1].quantidade).toBe(3)
  })

  it('preserva o zero à esquerda do código de barras', () => {
    const resultado = extrairItensXml(XML_CEAN_COM_ZERO_A_ESQUERDA)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens[0].codigo_barras).toBe('0123456789012')
  })

  it('retorna erro para um arquivo que não é XML válido', () => {
    const resultado = extrairItensXml(XML_MALFORMADO)
    expect(resultado).toEqual({ erro: 'Não foi possível ler o arquivo. Verifique se é um XML válido.' })
  })
})
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/cargas/importar-xml-nfe.test.ts`
Expected: FAIL com `Cannot find module './importar-xml-nfe'`.

- [ ] **Step 4: Implementar `lib/cargas/importar-xml-nfe.ts`**

```ts
import { XMLParser, XMLValidator } from 'fast-xml-parser'

export interface ItemExtraidoXml {
  codigo_barras: string | null
  descricao_xml: string
  quantidade: number | null
  valor_unitario: number | null
  erro: string | null
}

export type ResultadoExtracaoXml = { itens: ItemExtraidoXml[] } | { erro: string }

function numeroOuNulo(valor: unknown): number | null {
  if (valor === undefined || valor === null) return null
  const texto = String(valor).trim()
  if (texto === '') return null
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

export function extrairItensXml(xmlConteudo: string): ResultadoExtracaoXml {
  const validacao = XMLValidator.validate(xmlConteudo)
  if (validacao !== true) {
    return { erro: 'Não foi possível ler o arquivo. Verifique se é um XML válido.' }
  }

  const parser = new XMLParser({
    isArray: (nome) => nome === 'det',
    parseTagValue: false,
  })

  const documento = parser.parse(xmlConteudo) as Record<string, unknown>
  const nfeProc = documento.nfeProc as Record<string, unknown> | undefined
  const nfe = (nfeProc?.NFe ?? documento.NFe) as Record<string, unknown> | undefined
  const infNFe = nfe?.infNFe as Record<string, unknown> | undefined

  if (!infNFe) {
    return { erro: 'Este arquivo não parece ser o XML de uma NF-e.' }
  }

  const detalhes = infNFe.det as Record<string, unknown>[] | undefined
  if (!detalhes || detalhes.length === 0) {
    return { erro: 'Esta nota não tem itens para importar.' }
  }

  const itens: ItemExtraidoXml[] = detalhes.map((det) => {
    const prod = det.prod as Record<string, unknown> | undefined
    if (!prod) {
      return {
        codigo_barras: null,
        descricao_xml: '',
        quantidade: null,
        valor_unitario: null,
        erro: 'Item sem dados de produto.',
      }
    }

    const cean = prod.cEAN != null ? String(prod.cEAN).trim() : ''
    const codigoBarras = cean === '' || cean.toUpperCase() === 'SEM GTIN' ? null : cean
    const descricao = prod.xProd != null ? String(prod.xProd) : ''
    const quantidade = numeroOuNulo(prod.qCom)
    const valorUnitario = numeroOuNulo(prod.vUnCom)

    if (quantidade === null || valorUnitario === null) {
      return {
        codigo_barras: codigoBarras,
        descricao_xml: descricao,
        quantidade,
        valor_unitario: valorUnitario,
        erro: 'Quantidade ou valor unitário inválido nesta linha.',
      }
    }

    return {
      codigo_barras: codigoBarras,
      descricao_xml: descricao,
      quantidade,
      valor_unitario: valorUnitario,
      erro: null,
    }
  })

  return { itens }
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/cargas/importar-xml-nfe.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/cargas/importar-xml-nfe.ts lib/cargas/importar-xml-nfe.test.ts
git commit -m "feat: add pure NF-e XML parsing for carga item import"
```

---

### Task 2: Server Action de casamento por código de barras

**Files:**
- Create: `actions/xml-nfe-actions.ts`
- Test: `tests/xml-nfe-actions.test.ts`

**Interfaces:**
- Consumes: `extrairItensXml` de `lib/cargas/importar-xml-nfe.ts` (Task 1).
- Produces: `export interface ItemXmlNfe { codigo_barras: string | null; descricao_xml: string; quantidade: number | null; valor_unitario: number | null; produto_id: string | null; produto_codigo: string | null; produto_nome: string | null; produto_unidade: string | null; status: 'casado' | 'manual' | 'erro'; mensagem_erro: string | null }` e `export async function importarXmlNfe(xmlConteudo: string): Promise<ResultadoAcao<ItemXmlNfe[]>>` — consumido pela Task 4.

- [ ] **Step 1: Escrever o teste em `tests/xml-nfe-actions.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import { importarXmlNfe } from '@/actions/xml-nfe-actions'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const EAN_CASADO = '7899991110001'
const EAN_AMBIGUO = '7899991110002'
const EAN_INATIVO = '7899991110003'
const EAN_SEM_MATCH = '7899991110004'

let produtoCasadoId: string
let produtoAmbiguoAId: string
let produtoAmbiguoBId: string
let produtoInativoId: string

function xmlComItens(itens: { cEAN: string; xProd: string; qCom: string; vUnCom: string }[]): string {
  const dets = itens
    .map(
      (item, indice) => `
      <det nItem="${indice + 1}">
        <prod>
          <cEAN>${item.cEAN}</cEAN>
          <xProd>${item.xProd}</xProd>
          <qCom>${item.qCom}</qCom>
          <vUnCom>${item.vUnCom}</vUnCom>
        </prod>
      </det>`
    )
    .join('')
  return `<NFe><infNFe Id="NFeTeste" versao="4.00">${dets}</infNFe></NFe>`
}

describe('importarXmlNfe', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()

    const { data: casado } = await supabase
      .from('produtos')
      .insert({ codigo: 'TESTE-XML-CASADO', nome: 'Produto Casado', unidade: 'un', codigo_barras: EAN_CASADO })
      .select()
      .single()
    produtoCasadoId = casado!.id

    const { data: ambiguoA } = await supabase
      .from('produtos')
      .insert({ codigo: 'TESTE-XML-AMBIGUO-A', nome: 'Produto Ambíguo A', unidade: 'un', codigo_barras: EAN_AMBIGUO })
      .select()
      .single()
    produtoAmbiguoAId = ambiguoA!.id

    const { data: ambiguoB } = await supabase
      .from('produtos')
      .insert({ codigo: 'TESTE-XML-AMBIGUO-B', nome: 'Produto Ambíguo B', unidade: 'un', codigo_barras: EAN_AMBIGUO })
      .select()
      .single()
    produtoAmbiguoBId = ambiguoB!.id

    const { data: inativo } = await supabase
      .from('produtos')
      .insert({ codigo: 'TESTE-XML-INATIVO', nome: 'Produto Inativo', unidade: 'un', codigo_barras: EAN_INATIVO, ativo: false })
      .select()
      .single()
    produtoInativoId = inativo!.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('produtos').delete().in('id', [produtoCasadoId, produtoAmbiguoAId, produtoAmbiguoBId, produtoInativoId])
  })

  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  it('casa automaticamente um item com código de barras único', async () => {
    const xml = xmlComItens([{ cEAN: EAN_CASADO, xProd: 'Produto Casado', qCom: '5.0000', vUnCom: '10.0000' }])
    const resultado = await importarXmlNfe(xml)

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados).toHaveLength(1)
    expect(resultado.dados[0].status).toBe('casado')
    expect(resultado.dados[0].produto_id).toBe(produtoCasadoId)
  })

  it('não casa quando dois produtos compartilham o mesmo código de barras', async () => {
    const xml = xmlComItens([{ cEAN: EAN_AMBIGUO, xProd: 'Produto Ambíguo', qCom: '1.0000', vUnCom: '1.0000' }])
    const resultado = await importarXmlNfe(xml)

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados[0].status).toBe('manual')
    expect(resultado.dados[0].produto_id).toBeNull()
  })

  it('não casa com um produto inativo mesmo com código de barras correspondente', async () => {
    const xml = xmlComItens([{ cEAN: EAN_INATIVO, xProd: 'Produto Inativo', qCom: '1.0000', vUnCom: '1.0000' }])
    const resultado = await importarXmlNfe(xml)

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados[0].status).toBe('manual')
  })

  it('marca como manual quando nenhum produto tem aquele código de barras', async () => {
    const xml = xmlComItens([{ cEAN: EAN_SEM_MATCH, xProd: 'Produto Sem Match', qCom: '1.0000', vUnCom: '1.0000' }])
    const resultado = await importarXmlNfe(xml)

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) throw new Error('esperava sucesso')
    expect(resultado.dados[0].status).toBe('manual')
  })

  it('devolve erro amigável para um XML que não é NF-e', async () => {
    const resultado = await importarXmlNfe('<algumaCoisa></algumaCoisa>')
    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) throw new Error('esperava falha')
    expect(resultado.erro).toBe('Este arquivo não parece ser o XML de uma NF-e.')
  })

  it('rejeita chamada de um usuário sem acesso ao módulo cargas', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...ADMIN_PROFILE, permissions: ['dashboard'] } as never)
    const xml = xmlComItens([{ cEAN: EAN_CASADO, xProd: 'Produto Casado', qCom: '1.0000', vUnCom: '1.0000' }])
    await expect(importarXmlNfe(xml)).rejects.toThrow('Acesso negado.')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/xml-nfe-actions.test.ts`
Expected: FAIL com `Cannot find module '@/actions/xml-nfe-actions'`.

- [ ] **Step 3: Implementar `actions/xml-nfe-actions.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import { extrairItensXml } from '@/lib/cargas/importar-xml-nfe'
import type { ResultadoAcao } from '@/lib/types/acao'

export interface ItemXmlNfe {
  codigo_barras: string | null
  descricao_xml: string
  quantidade: number | null
  valor_unitario: number | null
  produto_id: string | null
  produto_codigo: string | null
  produto_nome: string | null
  produto_unidade: string | null
  status: 'casado' | 'manual' | 'erro'
  mensagem_erro: string | null
}

export async function importarXmlNfe(xmlConteudo: string): Promise<ResultadoAcao<ItemXmlNfe[]>> {
  await assertModuleAccess('cargas')

  const extraido = extrairItensXml(xmlConteudo)
  if ('erro' in extraido) {
    return { sucesso: false, erro: extraido.erro }
  }

  const eans = extraido.itens
    .map((item) => item.codigo_barras)
    .filter((ean): ean is string => ean !== null)

  const produtosPorEan = new Map<string, { id: string; codigo: string; nome: string; unidade: string }[]>()

  if (eans.length > 0) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('produtos')
      .select('id, codigo, nome, unidade, codigo_barras')
      .in('codigo_barras', eans)
      .eq('ativo', true)

    if (error) return { sucesso: false, erro: error.message }

    for (const produto of data ?? []) {
      const chave = produto.codigo_barras as string
      const lista = produtosPorEan.get(chave) ?? []
      lista.push({ id: produto.id, codigo: produto.codigo, nome: produto.nome, unidade: produto.unidade })
      produtosPorEan.set(chave, lista)
    }
  }

  const itens: ItemXmlNfe[] = extraido.itens.map((item) => {
    if (item.erro) {
      return {
        codigo_barras: item.codigo_barras,
        descricao_xml: item.descricao_xml,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        produto_id: null,
        produto_codigo: null,
        produto_nome: null,
        produto_unidade: null,
        status: 'erro',
        mensagem_erro: item.erro,
      }
    }

    const candidatos = item.codigo_barras ? produtosPorEan.get(item.codigo_barras) ?? [] : []

    if (candidatos.length === 1) {
      const produto = candidatos[0]
      return {
        codigo_barras: item.codigo_barras,
        descricao_xml: item.descricao_xml,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        produto_id: produto.id,
        produto_codigo: produto.codigo,
        produto_nome: produto.nome,
        produto_unidade: produto.unidade,
        status: 'casado',
        mensagem_erro: null,
      }
    }

    return {
      codigo_barras: item.codigo_barras,
      descricao_xml: item.descricao_xml,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
      produto_id: null,
      produto_codigo: null,
      produto_nome: null,
      produto_unidade: null,
      status: 'manual',
      mensagem_erro: null,
    }
  })

  return { sucesso: true, dados: itens }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/xml-nfe-actions.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add actions/xml-nfe-actions.ts tests/xml-nfe-actions.test.ts
git commit -m "feat: add Server Action to match NF-e XML items against cadastro by barcode"
```

---

### Task 3: Mesclagem pura dos itens importados

**Files:**
- Create: `lib/cargas/mesclar-itens-importados.ts`
- Test: `lib/cargas/mesclar-itens-importados.test.ts`

**Interfaces:**
- Consumes: `ItemCargaLocal` de `components/cargas/adicionar-produto-modal.tsx` (já existente).
- Produces: `export function mesclarItensImportados(itensAtuais: ItemCargaLocal[], itensImportados: ItemCargaLocal[]): ItemCargaLocal[]` — consumido pela Task 4.

- [ ] **Step 1: Escrever o teste em `lib/cargas/mesclar-itens-importados.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mesclarItensImportados } from './mesclar-itens-importados'
import type { ItemCargaLocal } from '@/components/cargas/adicionar-produto-modal'

function item(produtoId: string, quantidade: number, valorUnitario: number): ItemCargaLocal {
  return {
    produto_id: produtoId,
    produto_codigo: `COD-${produtoId}`,
    produto_nome: `Produto ${produtoId}`,
    produto_unidade: 'un',
    quantidade,
    valor_unitario: valorUnitario,
  }
}

describe('mesclarItensImportados', () => {
  it('adiciona como item novo quando o produto não está na lista atual', () => {
    const resultado = mesclarItensImportados([], [item('p1', 5, 10)])
    expect(resultado).toEqual([item('p1', 5, 10)])
  })

  it('soma a quantidade quando o produto já está na lista atual, usando o valor do importado', () => {
    const atuais = [item('p1', 10, 5)]
    const resultado = mesclarItensImportados(atuais, [item('p1', 3, 8)])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].quantidade).toBe(13)
    expect(resultado[0].valor_unitario).toBe(8)
  })

  it('soma itens duplicados dentro da própria importação, mesmo sem estar na lista atual', () => {
    const resultado = mesclarItensImportados([], [item('p1', 2, 10), item('p1', 3, 12)])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].quantidade).toBe(5)
    expect(resultado[0].valor_unitario).toBe(12)
  })

  it('mantém itens de produtos diferentes como linhas separadas', () => {
    const resultado = mesclarItensImportados([item('p1', 1, 1)], [item('p2', 2, 2)])
    expect(resultado).toHaveLength(2)
  })

  it('não modifica os arrays originais (itensAtuais permanece intacto)', () => {
    const atuais = [item('p1', 10, 5)]
    mesclarItensImportados(atuais, [item('p1', 3, 8)])
    expect(atuais[0].quantidade).toBe(10)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/cargas/mesclar-itens-importados.test.ts`
Expected: FAIL com `Cannot find module './mesclar-itens-importados'`.

- [ ] **Step 3: Implementar `lib/cargas/mesclar-itens-importados.ts`**

```ts
import type { ItemCargaLocal } from '@/components/cargas/adicionar-produto-modal'

export function mesclarItensImportados(
  itensAtuais: ItemCargaLocal[],
  itensImportados: ItemCargaLocal[]
): ItemCargaLocal[] {
  const resultado = itensAtuais.map((item) => ({ ...item }))

  for (const itemImportado of itensImportados) {
    const indiceExistente = resultado.findIndex((item) => item.produto_id === itemImportado.produto_id)
    if (indiceExistente >= 0) {
      resultado[indiceExistente] = {
        ...resultado[indiceExistente],
        quantidade: resultado[indiceExistente].quantidade + itemImportado.quantidade,
        valor_unitario: itemImportado.valor_unitario,
      }
    } else {
      resultado.push({ ...itemImportado })
    }
  }

  return resultado
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/cargas/mesclar-itens-importados.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/cargas/mesclar-itens-importados.ts lib/cargas/mesclar-itens-importados.test.ts
git commit -m "feat: add pure merge logic for imported carga items"
```

---

### Task 4: Modal de importação e integração no formulário de carga

**Files:**
- Create: `components/cargas/importar-xml-modal.tsx`
- Modify: `components/cargas/carga-form.tsx`

**Interfaces:**
- Consumes: `importarXmlNfe`, `ItemXmlNfe` de `actions/xml-nfe-actions.ts` (Task 2); `mesclarItensImportados` de `lib/cargas/mesclar-itens-importados.ts` (Task 3); `ItemCargaLocal`, `ProdutoDisponivel` de `components/cargas/adicionar-produto-modal.tsx` (já existente).
- Produces: nenhuma interface nova pra outras tasks — esta é a última task do plano.

Sem testes automatizados — UI pura, mesma convenção já usada pelos outros modais deste módulo (`adicionar-produto-modal.tsx`, `custo-modal.tsx`, `venda-modal.tsx`, nenhum tem teste dedicado). Verificação é manual no navegador ao final, mais `npx tsc --noEmit` e `npm run build`.

- [ ] **Step 1: Criar `components/cargas/importar-xml-modal.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { importarXmlNfe, type ItemXmlNfe } from '@/actions/xml-nfe-actions'
import type { ItemCargaLocal, ProdutoDisponivel } from './adicionar-produto-modal'

interface LinhaRevisao {
  chave: string
  produto_id: string | null
  quantidade: string
  valor_unitario: string
  descricao_xml: string
  status: 'casado' | 'manual' | 'erro'
  mensagem_erro: string | null
}

function linhaValida(linha: LinhaRevisao): boolean {
  if (!linha.produto_id) return false
  const quantidadeNum = Number(linha.quantidade)
  const valorNum = Number(linha.valor_unitario)
  if (!(quantidadeNum > 0)) return false
  if (!Number.isFinite(valorNum) || valorNum < 0) return false
  return true
}

export function ImportarXmlModal({
  open,
  onOpenChange,
  produtosDisponiveis,
  onImportar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  produtosDisponiveis: ProdutoDisponivel[]
  onImportar: (itens: ItemCargaLocal[]) => void
}) {
  const [passo, setPasso] = useState<'upload' | 'revisao'>('upload')
  const [linhas, setLinhas] = useState<LinhaRevisao[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function resetar() {
    setPasso('upload')
    setLinhas([])
    setError(null)
  }

  function handleFechar(novoOpen: boolean) {
    if (!novoOpen) resetar()
    onOpenChange(novoOpen)
  }

  function handleArquivoSelecionado(arquivo: File) {
    setError(null)
    const leitor = new FileReader()
    leitor.onload = () => {
      const conteudo = String(leitor.result ?? '')
      startTransition(async () => {
        const resultado = await importarXmlNfe(conteudo)
        if (!resultado.sucesso) {
          setError(resultado.erro)
          return
        }
        setLinhas(
          resultado.dados.map((item: ItemXmlNfe) => ({
            chave: crypto.randomUUID(),
            produto_id: item.produto_id,
            quantidade: item.quantidade != null ? String(item.quantidade) : '',
            valor_unitario: item.valor_unitario != null ? String(item.valor_unitario) : '',
            descricao_xml: item.descricao_xml,
            status: item.status,
            mensagem_erro: item.mensagem_erro,
          }))
        )
        setPasso('revisao')
      })
    }
    leitor.onerror = () => setError('Não foi possível ler o arquivo.')
    leitor.readAsText(arquivo)
  }

  function handleAtualizarLinha(
    chave: string,
    campo: 'produto_id' | 'quantidade' | 'valor_unitario',
    valor: string
  ) {
    setLinhas((atual) =>
      atual.map((linha) =>
        linha.chave === chave ? { ...linha, [campo]: campo === 'produto_id' ? valor || null : valor } : linha
      )
    )
  }

  function handleRemoverLinha(chave: string) {
    setLinhas((atual) => atual.filter((linha) => linha.chave !== chave))
  }

  function handleConfirmar() {
    const itens: ItemCargaLocal[] = linhas.map((linha) => {
      const produto = produtosDisponiveis.find((p) => p.id === linha.produto_id)!
      return {
        produto_id: produto.id,
        produto_codigo: produto.codigo,
        produto_nome: produto.nome,
        produto_unidade: produto.unidade,
        quantidade: Number(linha.quantidade),
        valor_unitario: Number(linha.valor_unitario),
      }
    })
    onImportar(itens)
    handleFechar(false)
  }

  const podeConfirmar = linhas.length > 0 && linhas.every(linhaValida)

  return (
    <Dialog open={open} onOpenChange={handleFechar}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogTitle>Importar XML da NF-e</DialogTitle>
        <div className="mt-4 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {passo === 'upload' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="arquivo-xml">Arquivo XML</Label>
              <Input
                id="arquivo-xml"
                type="file"
                accept=".xml"
                disabled={isPending}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0]
                  if (arquivo) handleArquivoSelecionado(arquivo)
                }}
              />
              {isPending && <p className="text-sm text-slate-500">Lendo arquivo...</p>}
            </div>
          )}

          {passo === 'revisao' && (
            <div className="space-y-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2">Status</th>
                    <th className="py-2">Produto na nota</th>
                    <th className="py-2">Produto do sistema</th>
                    <th className="py-2">Qtd.</th>
                    <th className="py-2">Valor unit.</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha) => (
                    <tr key={linha.chave} className="border-b align-top">
                      <td className="py-2">
                        {linha.status === 'casado' && <span className="text-emerald-700">Casado</span>}
                        {linha.status === 'manual' && <span className="text-amber-700">Selecione</span>}
                        {linha.status === 'erro' && <span className="text-red-700">Erro</span>}
                      </td>
                      <td className="py-2 text-slate-500">
                        {linha.descricao_xml}
                        {linha.mensagem_erro && <p className="text-xs text-red-600">{linha.mensagem_erro}</p>}
                      </td>
                      <td className="py-2">
                        <select
                          value={linha.produto_id ?? ''}
                          onChange={(e) => handleAtualizarLinha(linha.chave, 'produto_id', e.target.value)}
                          className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
                        >
                          <option value="">Selecione...</option>
                          {produtosDisponiveis.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.codigo} — {p.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          className="w-20"
                          value={linha.quantidade}
                          onChange={(e) => handleAtualizarLinha(linha.chave, 'quantidade', e.target.value)}
                        />
                      </td>
                      <td className="py-2">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          className="w-24"
                          value={linha.valor_unitario}
                          onChange={(e) => handleAtualizarLinha(linha.chave, 'valor_unitario', e.target.value)}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoverLinha(linha.chave)}>
                          Remover
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!podeConfirmar && linhas.length > 0 && (
                <p className="text-sm text-amber-700">
                  Selecione um produto e confirme valores válidos em todas as linhas antes de importar.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => handleFechar(false)}>
              Cancelar
            </Button>
            {passo === 'revisao' && (
              <Button type="button" onClick={handleConfirmar} disabled={!podeConfirmar}>
                Confirmar importação
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Integrar em `components/cargas/carga-form.tsx`**

Esse arquivo já importa `AdicionarProdutoModal`, `ItemCargaLocal`, `ProdutoDisponivel` de `./adicionar-produto-modal` e mantém o estado `itens`/`setItens`. Adicione:

```ts
import { ImportarXmlModal } from './importar-xml-modal'
import { mesclarItensImportados } from '@/lib/cargas/mesclar-itens-importados'
```

Dentro do componente, junto dos outros `useState`:

```ts
const [importarAberto, setImportarAberto] = useState(false)
```

Handler, junto dos outros handlers (`handleAbrirAdicionar` etc.):

```ts
function handleImportarXml(itensImportados: ItemCargaLocal[]) {
  setItens((atual) => mesclarItensImportados(atual, itensImportados))
}
```

No JSX, ao lado do botão "Adicionar produto" já existente (dentro do mesmo `<div className="flex items-center justify-between">`):

```tsx
<Button type="button" variant="outline" size="sm" onClick={() => setImportarAberto(true)}>
  Importar XML da NF-e
</Button>
```

E, ao lado do `<AdicionarProdutoModal ... />` já renderizado no final do `<form>`:

```tsx
<ImportarXmlModal
  open={importarAberto}
  onOpenChange={setImportarAberto}
  produtosDisponiveis={produtosDisponiveis}
  onImportar={handleImportarXml}
/>
```

Note: aqui é `produtosDisponiveis` (a lista completa, sem filtro), **não** `produtosParaModal` (que filtra produtos já presentes na lista). A importação por XML precisa poder vincular um item a um produto já presente na carga — a mesclagem (Task 3) já soma a quantidade corretamente nesse caso, então não há razão para esconder esses produtos do seletor de revisão.

- [ ] **Step 3: Rodar `npx tsc --noEmit` e `npm run build`, confirmar que ambos ficam limpos**

- [ ] **Step 4: Verificação manual no navegador**

Com o servidor rodando (`npm run dev`), abrir o formulário de criar/editar carga, clicar em "Importar XML da NF-e", selecionar um arquivo `.xml` de teste (pode usar um dos XMLs literais dos testes da Task 1/2, salvos localmente como arquivo) e confirmar que: a tela de revisão aparece com os itens certos, produtos sem código de barras correspondente ficam com "Selecione" e o botão "Confirmar importação" desabilitado até escolher um produto pra eles, e que confirmar realmente adiciona os itens na lista da carga (inclusive somando se o produto já estava lá).

- [ ] **Step 5: Commit**

```bash
git add components/cargas/importar-xml-modal.tsx components/cargas/carga-form.tsx
git commit -m "feat: add NF-e XML import UI to carga form"
```
