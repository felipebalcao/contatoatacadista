# Importação em massa via CSV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um fluxo de importação em massa via `.csv` (upload → mapeamento de colunas → prévia com validação → confirmar → resultado) aos três cadastros existentes — Clientes, Produtos e Fornecedores — construído sobre um motor genérico reaproveitável.

**Architecture:** Um componente client genérico `<ImportadorCsv>` dirige as quatro etapas do fluxo e é configurado por módulo através de um objeto `ConfiguracaoImportacao<T>` (campos, validação, chave única, busca de chaves existentes, gravação em lote). Cada módulo ganha um arquivo de configuração pequeno, duas Server Actions novas (`listXXX`/`importarXXX`) que reaproveitam a Server Action de criar já existente linha a linha, uma página `/módulo/importar` e um botão na listagem. Nenhuma tabela ou policy nova — só reaproveita o que os três módulos já têm.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 (strict), Tailwind CSS + shadcn/ui, Supabase (RLS existente, sem migração), Vitest, `papaparse` (nova dependência, para ler o CSV no navegador).

**Spec:** [docs/superpowers/specs/2026-09-29-importacao-csv-design.md](../specs/2026-09-29-importacao-csv-design.md)

## Global Constraints

- Segue a stack e convenções já estabelecidas: Next.js App Router, TypeScript `strict`, Tailwind + shadcn/ui, Vitest, npm.
- **Refinamento do spec:** `ConfiguracaoImportacao<T>.importar` recebe `{ numero: number; valores: T }[]` (não `T[]` puro) — o `numero` é a linha original do CSV que o usuário viu na prévia, para que `ResultadoImportacao.pulados[].linha` aponte para a linha certa mesmo que algumas linhas tenham sido filtradas (erro/duplicada) antes do envio.
- **Fronteira client/server do Next.js:** o objeto de configuração de cada módulo (`campos`, `validarLinha`, `chaveUnica`) contém funções síncronas comuns — essas **não podem** ser construídas num Server Component e passadas como prop para `<ImportadorCsv>` (só Server Actions cruzam essa fronteira como prop). Por isso cada `app/(app)/<modulo>/importar/page.tsx` só chama `requireModuleAccess` e renderiza um wrapper `'use client'` (`importar-<modulo>-page-client.tsx`) que importa a configuração e monta `<ImportadorCsv config={...} />` inteiramente no lado client. O arquivo de configuração em si não precisa de diretiva — ele só é importado por módulos client, então entra no bundle do client normalmente, e importar uma Server Action (`listXXX`/`importarXXX`) de dentro dele funciona do mesmo jeito que já funciona em `cliente-form.tsx`/`produto-form.tsx` hoje.
- Toda Server Action nova (`listCodigosProdutos`, `importarProdutos`, `listDocumentosClientes`, `importarClientes`, `listDocumentosFornecedores`, `importarFornecedores`) chama `assertModuleAccess(<modulo>)` como primeira linha — mesmo padrão das ações já existentes.
- `importarXXX` nunca insere direto na tabela — chama a Server Action de criar já existente (`createProduto`/`createCliente`/`createFornecedor`) para cada linha, dentro de um `try/catch` por linha; qualquer erro (unicidade, validação, rede) vira um item em `pulados`, nunca aborta as linhas seguintes.
- Detecção de PF/PJ em Clientes/Fornecedores: documento normalizado (`normalizarDocumento`) com 11 dígitos → `pf`, 14 → `pj`; qualquer outro tamanho é erro de validação ("Documento inválido."), mesma mensagem do formulário manual.
- **Gotcha conhecido deste projeto:** o `Button` de `components/ui/button.tsx` embrulha `@base-ui/react` e não tem prop `asChild`. Para um link estilizado como botão, usar `buttonVariants({ variant, size })` na `className` de um `<Link>`.
- `SUPABASE_SERVICE_ROLE_KEY` só em código server-only, nunca em Client Components.

## Review Focus

- BOM (`﻿`) no início do cabeçalho do CSV (comum em exportação de planilha no Windows) quebrando o mapeamento automático só da primeira coluna — `normalizarTexto` remove o BOM antes de comparar (Task 1).
- Duas linhas do **mesmo arquivo** com o mesmo documento/código (não só duplicata contra o banco) — extraído numa função pura testável (`detectarDuplicadas`), não deixado só dentro do componente de UI sem teste (Task 1).
- CPF/CNPJ digitado com pontuação no CSV (`123.456.789-01`) sendo normalizado antes de validar e antes de virar a chave de duplicidade — testado no `validarLinha` de Clientes/Fornecedores (Tasks 4 e 5).
- Uma linha cujo documento/código já existe **no banco** (não só no arquivo) sendo pulada sem alterar o cadastro existente — testado com um registro real pré-existente nos testes de integração (Tasks 3, 4 e 5).
- Campo obrigatório mapeado para uma coluna cujo valor vem vazio/só espaço em algumas linhas — vira `status: 'erro'` com mensagem clara antes de chegar à Server Action (Tasks 3, 4 e 5).

---

### Task 1: Motor de importação — tipos, normalização, sugestão de mapeamento e detecção de duplicidade

**Files:**
- Create: `lib/importacao/tipos.ts`, `lib/importacao/normalizar.ts`, `lib/importacao/sugerir-mapeamento.ts`, `lib/importacao/detectar-duplicadas.ts`
- Test: `tests/normalizar-texto.test.ts`, `tests/sugerir-mapeamento.test.ts`, `tests/detectar-duplicadas.test.ts`
- Modify: `package.json` (nova dependência `papaparse` + `@types/papaparse`)

**Interfaces:**
- Produces:
  - `CampoImportacao { chave: string; rotulo: string; obrigatorio: boolean; apelidos?: string[] }`
  - `LinhaImportacao<T> { numero: number; bruta: Record<string, string>; valores: T | null; status: 'ok' | 'erro' | 'duplicada'; mensagens: string[]; incluir: boolean }`
  - `LinhaParaImportar<T> { numero: number; valores: T }`
  - `ResultadoImportacao { criados: number; pulados: { linha: number; motivo: string }[] }`
  - `ConfiguracaoImportacao<T> { tituloModulo: string; campos: CampoImportacao[]; validarLinha: (bruta: Record<string, string>) => { valores: T | null; mensagens: string[] }; chaveUnica: (valores: T) => string; listarChavesExistentes: () => Promise<string[]>; importar: (linhas: LinhaParaImportar<T>[]) => Promise<ResultadoImportacao>; linkListagem: string }` (todos em `lib/importacao/tipos.ts`)
  - `normalizarTexto(texto: string): string` (`lib/importacao/normalizar.ts`)
  - `sugerirMapeamento(colunasCsv: string[], campos: CampoImportacao[]): Record<string, string>` (`lib/importacao/sugerir-mapeamento.ts`)
  - `detectarDuplicadas(chaves: (string | null)[], chavesExistentes: string[]): boolean[]` (`lib/importacao/detectar-duplicadas.ts`)

- [ ] **Step 1: Instalar as dependências**

```bash
npm install papaparse
npm install -D @types/papaparse
```

- [ ] **Step 2: Escrever os testes (falhando)**

Crie `tests/normalizar-texto.test.ts`:

```ts
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
```

Crie `tests/sugerir-mapeamento.test.ts`:

```ts
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
```

Crie `tests/detectar-duplicadas.test.ts`:

```ts
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
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

```bash
npm test -- normalizar-texto sugerir-mapeamento detectar-duplicadas
```

Esperado: FAIL — nenhum dos três módulos existe ainda.

- [ ] **Step 4: Implementar `lib/importacao/tipos.ts`**

```ts
export interface CampoImportacao {
  chave: string
  rotulo: string
  obrigatorio: boolean
  apelidos?: string[]
}

export interface LinhaImportacao<T> {
  numero: number
  bruta: Record<string, string>
  valores: T | null
  status: 'ok' | 'erro' | 'duplicada'
  mensagens: string[]
  incluir: boolean
}

export interface LinhaParaImportar<T> {
  numero: number
  valores: T
}

export interface ResultadoImportacao {
  criados: number
  pulados: { linha: number; motivo: string }[]
}

export interface ConfiguracaoImportacao<T> {
  tituloModulo: string
  campos: CampoImportacao[]
  validarLinha: (bruta: Record<string, string>) => { valores: T | null; mensagens: string[] }
  chaveUnica: (valores: T) => string
  listarChavesExistentes: () => Promise<string[]>
  importar: (linhas: LinhaParaImportar<T>[]) => Promise<ResultadoImportacao>
  linkListagem: string
}
```

- [ ] **Step 5: Implementar `lib/importacao/normalizar.ts`**

```ts
export function normalizarTexto(texto: string): string {
  return texto
    .replace(/^﻿/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}
```

- [ ] **Step 6: Implementar `lib/importacao/sugerir-mapeamento.ts`**

```ts
import { normalizarTexto } from './normalizar'
import type { CampoImportacao } from './tipos'

export function sugerirMapeamento(
  colunasCsv: string[],
  campos: CampoImportacao[]
): Record<string, string> {
  const mapeamento: Record<string, string> = {}

  for (const campo of campos) {
    const candidatos = [campo.chave, campo.rotulo, ...(campo.apelidos ?? [])].map(normalizarTexto)
    const coluna = colunasCsv.find((c) => candidatos.includes(normalizarTexto(c)))
    if (coluna) {
      mapeamento[campo.chave] = coluna
    }
  }

  return mapeamento
}
```

- [ ] **Step 7: Implementar `lib/importacao/detectar-duplicadas.ts`**

```ts
export function detectarDuplicadas(chaves: (string | null)[], chavesExistentes: string[]): boolean[] {
  const existentes = new Set(chavesExistentes)
  const vistas = new Set<string>()

  return chaves.map((chave) => {
    if (chave === null) return false
    const duplicada = existentes.has(chave) || vistas.has(chave)
    vistas.add(chave)
    return duplicada
  })
}
```

- [ ] **Step 8: Rodar os testes e confirmar que passam**

```bash
npm test -- normalizar-texto sugerir-mapeamento detectar-duplicadas
```

Esperado: PASS (13 testes).

- [ ] **Step 9: Commitar**

```bash
git add package.json package-lock.json lib/importacao/tipos.ts lib/importacao/normalizar.ts lib/importacao/sugerir-mapeamento.ts lib/importacao/detectar-duplicadas.ts tests/normalizar-texto.test.ts tests/sugerir-mapeamento.test.ts tests/detectar-duplicadas.test.ts
git commit -m "feat: add CSV import engine types, normalization and duplicate detection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Componente genérico `<ImportadorCsv>`

**Files:**
- Create: `components/importacao/importador-csv.tsx`

**Interfaces:**
- Consumes: `ConfiguracaoImportacao<T>`, `LinhaImportacao<T>`, `LinhaParaImportar<T>`, `ResultadoImportacao` (`lib/importacao/tipos.ts`, Task 1), `sugerirMapeamento` (Task 1), `detectarDuplicadas` (Task 1), `Button`/`buttonVariants` (`components/ui/button.tsx`), `Label` (`components/ui/label.tsx`), `Papa.parse` de `papaparse`.
- Produces: `ImportadorCsv<T>({ config: ConfiguracaoImportacao<T> })` — componente `'use client'`, sem props além de `config`, usado pelos três módulos nas Tasks 3-5.

- [ ] **Step 1: Criar `components/importacao/importador-csv.tsx`**

```tsx
'use client'

import { useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { sugerirMapeamento } from '@/lib/importacao/sugerir-mapeamento'
import { detectarDuplicadas } from '@/lib/importacao/detectar-duplicadas'
import type {
  ConfiguracaoImportacao,
  LinhaImportacao,
  ResultadoImportacao,
} from '@/lib/importacao/tipos'

type Etapa = 'upload' | 'mapear' | 'revisar' | 'resultado'

export function ImportadorCsv<T>({ config }: { config: ConfiguracaoImportacao<T> }) {
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const [colunasCsv, setColunasCsv] = useState<string[]>([])
  const [linhasBrutas, setLinhasBrutas] = useState<Record<string, string>[]>([])
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({})
  const [erroMapeamento, setErroMapeamento] = useState<string | null>(null)
  const [carregandoRevisao, setCarregandoRevisao] = useState(false)
  const [linhas, setLinhas] = useState<LinhaImportacao<T>[]>([])
  const [importando, setImportando] = useState(false)
  const [erroImportacao, setErroImportacao] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)

  function handleArquivo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0]
    event.target.value = ''
    if (!arquivo) return

    setErroArquivo(null)

    Papa.parse<Record<string, string>>(arquivo, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (res.errors.length > 0) {
          setErroArquivo('Não foi possível ler o arquivo. Confirme que é um CSV válido.')
          return
        }
        const colunas = res.meta.fields ?? []
        if (colunas.length === 0 || res.data.length === 0) {
          setErroArquivo('O arquivo está vazio ou não tem cabeçalho.')
          return
        }
        setColunasCsv(colunas)
        setLinhasBrutas(res.data)
        setMapeamento(sugerirMapeamento(colunas, config.campos))
        setEtapa('mapear')
      },
      error: () => {
        setErroArquivo('Não foi possível ler o arquivo. Confirme que é um CSV válido.')
      },
    })
  }

  function handleMapeamentoConfirmado() {
    const faltando = config.campos.filter((campo) => campo.obrigatorio && !mapeamento[campo.chave])
    if (faltando.length > 0) {
      setErroMapeamento(`Mapeie os campos obrigatórios: ${faltando.map((c) => c.rotulo).join(', ')}.`)
      return
    }

    setErroMapeamento(null)
    setCarregandoRevisao(true)

    config
      .listarChavesExistentes()
      .then((chavesExistentes) => {
        const brutasELinhas = linhasBrutas.map((linhaBruta) => {
          const bruta: Record<string, string> = {}
          for (const campo of config.campos) {
            const coluna = mapeamento[campo.chave]
            bruta[campo.chave] = coluna ? (linhaBruta[coluna] ?? '').trim() : ''
          }
          return { bruta, ...config.validarLinha(bruta) }
        })

        const chaves = brutasELinhas.map((l) => (l.valores ? config.chaveUnica(l.valores) : null))
        const duplicadas = detectarDuplicadas(chaves, chavesExistentes)

        const linhasProcessadas: LinhaImportacao<T>[] = brutasELinhas.map((l, indice) => {
          const numero = indice + 1
          if (!l.valores) {
            return { numero, bruta: l.bruta, valores: null, status: 'erro', mensagens: l.mensagens, incluir: false }
          }
          if (duplicadas[indice]) {
            return {
              numero,
              bruta: l.bruta,
              valores: l.valores,
              status: 'duplicada',
              mensagens: ['Já existe um cadastro com essa chave.'],
              incluir: false,
            }
          }
          return { numero, bruta: l.bruta, valores: l.valores, status: 'ok', mensagens: [], incluir: true }
        })

        setLinhas(linhasProcessadas)
        setEtapa('revisar')
      })
      .catch((err) => {
        setErroMapeamento(err instanceof Error ? err.message : 'Erro ao revisar o arquivo.')
      })
      .finally(() => setCarregandoRevisao(false))
  }

  function alternarLinha(numero: number) {
    setLinhas((atual) =>
      atual.map((linha) => (linha.numero === numero ? { ...linha, incluir: !linha.incluir } : linha))
    )
  }

  function handleConfirmarImportacao() {
    const paraImportar = linhas.filter((l) => l.incluir && l.status === 'ok' && l.valores !== null)
    if (paraImportar.length === 0) return

    setErroImportacao(null)
    setImportando(true)

    config
      .importar(paraImportar.map((l) => ({ numero: l.numero, valores: l.valores as T })))
      .then((res) => {
        setResultado(res)
        setEtapa('resultado')
      })
      .catch((err) => {
        setErroImportacao(err instanceof Error ? err.message : 'Erro ao importar.')
      })
      .finally(() => setImportando(false))
  }

  const contagem = {
    ok: linhas.filter((l) => l.status === 'ok').length,
    duplicada: linhas.filter((l) => l.status === 'duplicada').length,
    erro: linhas.filter((l) => l.status === 'erro').length,
  }
  const totalSelecionadas = linhas.filter((l) => l.incluir).length

  return (
    <div className="max-w-4xl space-y-6">
      {etapa === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Selecione um arquivo .csv com os {config.tituloModulo} para importar. A primeira linha deve ser
            o cabeçalho com o nome das colunas.
          </p>
          {erroArquivo && <p className="text-sm text-red-600">{erroArquivo}</p>}
          <input
            type="file"
            accept=".csv"
            onChange={handleArquivo}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </div>
      )}

      {etapa === 'mapear' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Confira o mapeamento das colunas do arquivo para os campos do cadastro. Campos com * são
            obrigatórios.
          </p>
          {erroMapeamento && <p className="text-sm text-red-600">{erroMapeamento}</p>}
          <div className="space-y-3">
            {config.campos.map((campo) => (
              <div key={campo.chave} className="grid grid-cols-2 items-center gap-4">
                <Label>
                  {campo.rotulo}
                  {campo.obrigatorio ? ' *' : ''}
                </Label>
                <select
                  value={mapeamento[campo.chave] ?? ''}
                  onChange={(e) => setMapeamento((atual) => ({ ...atual, [campo.chave]: e.target.value }))}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                >
                  <option value="">Não importar</option>
                  {colunasCsv.map((coluna) => (
                    <option key={coluna} value={coluna}>
                      {coluna}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleMapeamentoConfirmado} disabled={carregandoRevisao}>
              {carregandoRevisao ? 'Verificando...' : 'Continuar'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEtapa('upload')}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {etapa === 'revisar' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {contagem.ok} pronta(s) para importar, {contagem.duplicada} já cadastrada(s), {contagem.erro} com
            erro.
          </p>
          {erroImportacao && <p className="text-sm text-red-600">{erroImportacao}</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2"></th>
                <th className="py-2">Linha</th>
                <th className="py-2">Status</th>
                <th className="py-2">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.numero} className="border-b">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={linha.incluir}
                      disabled={linha.status !== 'ok'}
                      onChange={() => alternarLinha(linha.numero)}
                    />
                  </td>
                  <td className="py-2">{linha.numero}</td>
                  <td className="py-2">
                    <span
                      className={
                        linha.status === 'ok'
                          ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                          : linha.status === 'duplicada'
                            ? 'rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700'
                            : 'rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700'
                      }
                    >
                      {linha.status === 'ok' ? 'Ok' : linha.status === 'duplicada' ? 'Já existe' : 'Erro'}
                    </span>
                  </td>
                  <td className="py-2 text-slate-500">{linha.mensagens.join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleConfirmarImportacao}
              disabled={importando || totalSelecionadas === 0}
            >
              {importando ? 'Importando...' : `Importar ${totalSelecionadas} linha(s)`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEtapa('mapear')} disabled={importando}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {etapa === 'resultado' && resultado && (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            {resultado.criados} {config.tituloModulo} importado(s) com sucesso.
          </p>
          {resultado.pulados.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">{resultado.pulados.length} linha(s) pulada(s):</p>
              <ul className="list-disc pl-5 text-sm text-slate-500">
                {resultado.pulados.map((p) => (
                  <li key={p.linha}>
                    Linha {p.linha}: {p.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href={config.linkListagem} className={buttonVariants({ variant: 'default' })}>
            Voltar para a listagem
          </Link>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos e build**

```bash
npx tsc --noEmit
npm run build
```

Esperado: ambos sem erro. Nenhuma rota nova aparece no build ainda — este componente só é usado a partir da Task 3.

- [ ] **Step 3: Commitar**

```bash
git add components/importacao/importador-csv.tsx
git commit -m "feat: add generic ImportadorCsv component (upload, map, review, result)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Importação de Produtos

**Files:**
- Modify: `actions/produto-actions.ts`, `components/produtos/produtos-page-client.tsx`
- Create: `components/produtos/importar-produtos-config.ts`, `components/produtos/importar-produtos-page-client.tsx`, `app/(app)/produtos/importar/page.tsx`
- Test: `tests/importar-produtos-validacao.test.ts`, `tests/importar-produtos-actions.test.ts`

**Interfaces:**
- Consumes: `createProduto` (`actions/produto-actions.ts`, já existente), `ConfiguracaoImportacao`/`LinhaParaImportar`/`ResultadoImportacao` (Task 1), `ImportadorCsv` (Task 2), `requireModuleAccess`, `ProdutoInput`/`Produto` (`lib/types/database.ts`).
- Produces: `listCodigosProdutos(): Promise<string[]>`, `importarProdutos(linhas: LinhaParaImportar<ProdutoInput>[]): Promise<ResultadoImportacao>` em `actions/produto-actions.ts`; `configImportacaoProdutos: ConfiguracaoImportacao<ProdutoInput>` em `components/produtos/importar-produtos-config.ts`.

- [ ] **Step 1: Escrever o teste de validação de linha**

Crie `tests/importar-produtos-validacao.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validarLinhaProduto } from '@/components/produtos/importar-produtos-config'

describe('validarLinhaProduto', () => {
  it('aceita uma linha completa', () => {
    const { valores, mensagens } = validarLinhaProduto({
      codigo: '0100',
      nome: 'Produto Teste',
      unidade: 'un',
      codigo_barras: '7891234567890',
      categoria: 'Bebidas',
    })
    expect(mensagens).toEqual([])
    expect(valores).toEqual({
      codigo: '0100',
      nome: 'Produto Teste',
      unidade: 'un',
      codigo_barras: '7891234567890',
      categoria: 'Bebidas',
    })
  })

  it('aceita campos opcionais vazios como null', () => {
    const { valores } = validarLinhaProduto({
      codigo: '0100',
      nome: 'Produto Teste',
      unidade: 'un',
      codigo_barras: '',
      categoria: '',
    })
    expect(valores?.codigo_barras).toBeNull()
    expect(valores?.categoria).toBeNull()
  })

  it('rejeita código vazio', () => {
    const { valores, mensagens } = validarLinhaProduto({
      codigo: '   ',
      nome: 'Produto Teste',
      unidade: 'un',
      codigo_barras: '',
      categoria: '',
    })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Informe o código.')
  })

  it('rejeita nome vazio', () => {
    const { mensagens } = validarLinhaProduto({
      codigo: '0100',
      nome: '',
      unidade: 'un',
      codigo_barras: '',
      categoria: '',
    })
    expect(mensagens).toContain('Informe o nome.')
  })

  it('rejeita unidade vazia', () => {
    const { mensagens } = validarLinhaProduto({
      codigo: '0100',
      nome: 'Produto Teste',
      unidade: '',
      codigo_barras: '',
      categoria: '',
    })
    expect(mensagens).toContain('Informe a unidade.')
  })
})
```

- [ ] **Step 2: Escrever o teste de integração das Server Actions**

Crie `tests/importar-produtos-actions.test.ts`:

```ts
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
```

- [ ] **Step 3: Rodar os dois testes e confirmar que falham**

```bash
npm test -- importar-produtos-validacao importar-produtos-actions
```

Esperado: FAIL — nem `@/components/produtos/importar-produtos-config` nem `listCodigosProdutos`/`importarProdutos` existem ainda.

- [ ] **Step 4: Adicionar as Server Actions em `actions/produto-actions.ts`**

Adicione no topo do arquivo, junto dos outros imports:

```ts
import type { LinhaParaImportar, ResultadoImportacao } from '@/lib/importacao/tipos'
```

E adicione ao final do arquivo:

```ts
export async function listCodigosProdutos(): Promise<string[]> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('produtos').select('codigo')
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => p.codigo as string)
}

export async function importarProdutos(
  linhas: LinhaParaImportar<ProdutoInput>[]
): Promise<ResultadoImportacao> {
  await assertModuleAccess('produtos')
  let criados = 0
  const pulados: { linha: number; motivo: string }[] = []

  for (const linha of linhas) {
    try {
      await createProduto(linha.valores)
      criados++
    } catch (err) {
      pulados.push({ linha: linha.numero, motivo: err instanceof Error ? err.message : 'Erro desconhecido.' })
    }
  }

  return { criados, pulados }
}
```

- [ ] **Step 5: Criar `components/produtos/importar-produtos-config.ts`**

```ts
import { listCodigosProdutos, importarProdutos } from '@/actions/produto-actions'
import type { CampoImportacao, ConfiguracaoImportacao } from '@/lib/importacao/tipos'
import type { ProdutoInput } from '@/lib/types/database'

const CAMPOS: CampoImportacao[] = [
  { chave: 'codigo', rotulo: 'Código', obrigatorio: true },
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
  { chave: 'unidade', rotulo: 'Unidade', obrigatorio: true },
  { chave: 'codigo_barras', rotulo: 'Código de barras', obrigatorio: false, apelidos: ['ean', 'codigo de barras'] },
  { chave: 'categoria', rotulo: 'Categoria', obrigatorio: false },
]

export function validarLinhaProduto(
  bruta: Record<string, string>
): { valores: ProdutoInput | null; mensagens: string[] } {
  const codigo = bruta.codigo.trim()
  const nome = bruta.nome.trim()
  const unidade = bruta.unidade.trim()

  const mensagens: string[] = []
  if (codigo === '') mensagens.push('Informe o código.')
  if (nome === '') mensagens.push('Informe o nome.')
  if (unidade === '') mensagens.push('Informe a unidade.')

  if (mensagens.length > 0) return { valores: null, mensagens }

  return {
    valores: {
      codigo,
      nome,
      unidade,
      codigo_barras: bruta.codigo_barras.trim() || null,
      categoria: bruta.categoria.trim() || null,
    },
    mensagens: [],
  }
}

export const configImportacaoProdutos: ConfiguracaoImportacao<ProdutoInput> = {
  tituloModulo: 'produtos',
  campos: CAMPOS,
  validarLinha: validarLinhaProduto,
  chaveUnica: (valores) => valores.codigo,
  listarChavesExistentes: listCodigosProdutos,
  importar: importarProdutos,
  linkListagem: '/produtos',
}
```

- [ ] **Step 6: Rodar os dois testes e confirmar que passam**

```bash
npm test -- importar-produtos-validacao importar-produtos-actions
```

Esperado: PASS (5 + 3 = 8 testes).

- [ ] **Step 7: Criar a página de importação e o wrapper client**

Crie `components/produtos/importar-produtos-page-client.tsx`:

```tsx
'use client'

import { ImportadorCsv } from '@/components/importacao/importador-csv'
import { configImportacaoProdutos } from './importar-produtos-config'

export function ImportarProdutosPageClient() {
  return <ImportadorCsv config={configImportacaoProdutos} />
}
```

Crie `app/(app)/produtos/importar/page.tsx`:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ImportarProdutosPageClient } from '@/components/produtos/importar-produtos-page-client'

export default async function ImportarProdutosPage() {
  await requireModuleAccess('produtos')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Importar produtos</h1>
      <ImportarProdutosPageClient />
    </div>
  )
}
```

- [ ] **Step 8: Adicionar o botão na listagem**

Em `components/produtos/produtos-page-client.tsx`, troque:

```tsx
        <Link href="/produtos/novo" className={buttonVariants({ variant: 'default' })}>
          Novo produto
        </Link>
```

por:

```tsx
        <div className="flex gap-2">
          <Link href="/produtos/importar" className={buttonVariants({ variant: 'outline' })}>
            Importar CSV
          </Link>
          <Link href="/produtos/novo" className={buttonVariants({ variant: 'default' })}>
            Novo produto
          </Link>
        </div>
```

- [ ] **Step 9: Verificar tipos e build**

```bash
npx tsc --noEmit
npm run build
```

Esperado: ambos sem erro, com `/produtos/importar` na saída do build.

- [ ] **Step 10: Testar manualmente**

```bash
npm run dev
```

Acesse `/produtos`, clique "Importar CSV". Monte um `.csv` pequeno com colunas `Código,Nome,Unidade` (nessa ordem ou fora de ordem, tanto faz) e 2-3 linhas — confirme que o mapeamento é sugerido automaticamente, a prévia mostra "Ok", e depois de importar os produtos aparecem na listagem.

- [ ] **Step 11: Commitar**

```bash
git add actions/produto-actions.ts components/produtos/produtos-page-client.tsx components/produtos/importar-produtos-config.ts components/produtos/importar-produtos-page-client.tsx "app/(app)/produtos/importar" tests/importar-produtos-validacao.test.ts tests/importar-produtos-actions.test.ts
git commit -m "feat: add CSV import for produtos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Importação de Clientes

**Files:**
- Modify: `actions/cliente-actions.ts`, `components/clientes/clientes-page-client.tsx`
- Create: `components/clientes/importar-clientes-config.ts`, `components/clientes/importar-clientes-page-client.tsx`, `app/(app)/clientes/importar/page.tsx`
- Test: `tests/importar-clientes-validacao.test.ts`, `tests/importar-clientes-actions.test.ts`

**Interfaces:**
- Consumes: `createCliente` (já existente), `normalizarDocumento`/`validarDocumento` (`lib/validation/documento.ts`, já existente, sem alterações), `ConfiguracaoImportacao`/`LinhaParaImportar`/`ResultadoImportacao` (Task 1), `ImportadorCsv` (Task 2), `requireModuleAccess`, `ClienteInput`/`Cliente` (`lib/types/database.ts`).
- Produces: `listDocumentosClientes(): Promise<string[]>`, `importarClientes(linhas: LinhaParaImportar<ClienteInput>[]): Promise<ResultadoImportacao>` em `actions/cliente-actions.ts`; `configImportacaoClientes: ConfiguracaoImportacao<ClienteInput>` em `components/clientes/importar-clientes-config.ts`.

- [ ] **Step 1: Escrever o teste de validação de linha (falhando)**

Crie `tests/importar-clientes-validacao.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validarLinhaCliente } from '@/components/clientes/importar-clientes-config'

const LINHA_BASE = {
  documento: '',
  nome: 'Cliente Teste',
  nome_fantasia: '',
  telefone: '',
  email: '',
  endereco_rua: '',
  endereco_numero: '',
  endereco_bairro: '',
  endereco_cidade: '',
  endereco_uf: '',
  endereco_cep: '',
  observacoes: '',
}

describe('validarLinhaCliente', () => {
  it('detecta PF por CPF (11 dígitos) e normaliza pontuação', () => {
    const { valores, mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '111.444.777-35' })
    expect(mensagens).toEqual([])
    expect(valores?.tipo).toBe('pf')
    expect(valores?.documento).toBe('11144477735')
  })

  it('detecta PJ por CNPJ (14 dígitos) e normaliza pontuação', () => {
    const { valores, mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '11.222.333/0001-81' })
    expect(mensagens).toEqual([])
    expect(valores?.tipo).toBe('pj')
    expect(valores?.documento).toBe('11222333000181')
  })

  it('rejeita um CPF com dígito verificador errado', () => {
    const { valores, mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '111.444.777-36' })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Documento inválido.')
  })

  it('rejeita documento com tamanho que não é nem CPF nem CNPJ', () => {
    const { valores, mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '123' })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Documento inválido.')
  })

  it('rejeita nome vazio', () => {
    const { mensagens } = validarLinhaCliente({ ...LINHA_BASE, documento: '111.444.777-35', nome: '' })
    expect(mensagens).toContain('Informe o nome.')
  })

  it('aceita campos opcionais vazios como null', () => {
    const { valores } = validarLinhaCliente({ ...LINHA_BASE, documento: '111.444.777-35' })
    expect(valores?.telefone).toBeNull()
    expect(valores?.email).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npm test -- importar-clientes-validacao
```

Esperado: FAIL — `@/components/clientes/importar-clientes-config` não existe.

- [ ] **Step 3: Adicionar as Server Actions em `actions/cliente-actions.ts`**

Adicione no topo do arquivo, junto dos outros imports:

```ts
import type { LinhaParaImportar, ResultadoImportacao } from '@/lib/importacao/tipos'
```

E adicione ao final do arquivo:

```ts
export async function listDocumentosClientes(): Promise<string[]> {
  await assertModuleAccess('clientes')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('clientes').select('documento')
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => c.documento as string)
}

export async function importarClientes(
  linhas: LinhaParaImportar<ClienteInput>[]
): Promise<ResultadoImportacao> {
  await assertModuleAccess('clientes')
  let criados = 0
  const pulados: { linha: number; motivo: string }[] = []

  for (const linha of linhas) {
    try {
      await createCliente(linha.valores)
      criados++
    } catch (err) {
      pulados.push({ linha: linha.numero, motivo: err instanceof Error ? err.message : 'Erro desconhecido.' })
    }
  }

  return { criados, pulados }
}
```

- [ ] **Step 4: Criar `components/clientes/importar-clientes-config.ts`**

```ts
import { listDocumentosClientes, importarClientes } from '@/actions/cliente-actions'
import { normalizarDocumento, validarDocumento } from '@/lib/validation/documento'
import type { CampoImportacao, ConfiguracaoImportacao } from '@/lib/importacao/tipos'
import type { ClienteInput } from '@/lib/types/database'

const CAMPOS: CampoImportacao[] = [
  { chave: 'documento', rotulo: 'Documento (CPF/CNPJ)', obrigatorio: true, apelidos: ['cpf', 'cnpj', 'cpf/cnpj'] },
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true, apelidos: ['razao social', 'razão social'] },
  { chave: 'nome_fantasia', rotulo: 'Nome fantasia', obrigatorio: false },
  { chave: 'telefone', rotulo: 'Telefone', obrigatorio: false },
  { chave: 'email', rotulo: 'Email', obrigatorio: false },
  { chave: 'endereco_rua', rotulo: 'Rua', obrigatorio: false },
  { chave: 'endereco_numero', rotulo: 'Número', obrigatorio: false },
  { chave: 'endereco_bairro', rotulo: 'Bairro', obrigatorio: false },
  { chave: 'endereco_cidade', rotulo: 'Cidade', obrigatorio: false },
  { chave: 'endereco_uf', rotulo: 'UF', obrigatorio: false },
  { chave: 'endereco_cep', rotulo: 'CEP', obrigatorio: false },
  { chave: 'observacoes', rotulo: 'Observações', obrigatorio: false },
]

export function validarLinhaCliente(
  bruta: Record<string, string>
): { valores: ClienteInput | null; mensagens: string[] } {
  const nome = bruta.nome.trim()
  const documento = normalizarDocumento(bruta.documento)

  const mensagens: string[] = []
  if (nome === '') mensagens.push('Informe o nome.')

  const tipo = documento.length === 11 ? 'pf' : documento.length === 14 ? 'pj' : null
  if (!tipo || !validarDocumento(tipo, documento)) {
    mensagens.push('Documento inválido.')
  }

  if (mensagens.length > 0) return { valores: null, mensagens }

  return {
    valores: {
      tipo: tipo as 'pf' | 'pj',
      documento,
      nome,
      nome_fantasia: bruta.nome_fantasia.trim() || null,
      telefone: bruta.telefone.trim() || null,
      email: bruta.email.trim() || null,
      endereco_rua: bruta.endereco_rua.trim() || null,
      endereco_numero: bruta.endereco_numero.trim() || null,
      endereco_bairro: bruta.endereco_bairro.trim() || null,
      endereco_cidade: bruta.endereco_cidade.trim() || null,
      endereco_uf: bruta.endereco_uf.trim() || null,
      endereco_cep: bruta.endereco_cep.trim() || null,
      observacoes: bruta.observacoes.trim() || null,
    },
    mensagens: [],
  }
}

export const configImportacaoClientes: ConfiguracaoImportacao<ClienteInput> = {
  tituloModulo: 'clientes',
  campos: CAMPOS,
  validarLinha: validarLinhaCliente,
  chaveUnica: (valores) => valores.documento,
  listarChavesExistentes: listDocumentosClientes,
  importar: importarClientes,
  linkListagem: '/clientes',
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npm test -- importar-clientes-validacao
```

Esperado: PASS (6 testes).

- [ ] **Step 6: Escrever o teste de integração das Server Actions (falhando)**

Crie `tests/importar-clientes-actions.test.ts`:

```ts
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCliente, listDocumentosClientes, importarClientes } from '@/actions/cliente-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { LinhaParaImportar } from '@/lib/importacao/tipos'
import type { ClienteInput } from '@/lib/types/database'

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

const CLIENTE_BASE: ClienteInput = {
  tipo: 'pf',
  documento: DOCUMENTO_EXISTENTE,
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

describe('importarClientes / listDocumentosClientes', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('clientes').delete().in('documento', [DOCUMENTO_EXISTENTE, DOCUMENTO_NOVO])
  })

  it('lista os documentos já cadastrados', async () => {
    await createCliente(CLIENTE_BASE)

    const documentos = await listDocumentosClientes()

    expect(documentos).toContain(DOCUMENTO_EXISTENTE)
  })

  it('importa uma linha nova e pula uma linha com documento já existente, sem alterar o cadastro existente', async () => {
    const original = await createCliente({ ...CLIENTE_BASE, nome: 'Nome Original' })

    const linhas: LinhaParaImportar<ClienteInput>[] = [
      { numero: 1, valores: { ...CLIENTE_BASE, tipo: 'pj', documento: DOCUMENTO_NOVO, nome: 'Cliente Novo' } },
      { numero: 2, valores: { ...CLIENTE_BASE, nome: 'Nome Tentando Sobrescrever' } },
    ]

    const resultado = await importarClientes(linhas)

    expect(resultado.criados).toBe(1)
    expect(resultado.pulados).toEqual([
      { linha: 2, motivo: 'Já existe um cliente cadastrado com esse documento.' },
    ])

    const supabase = createAdminClient()
    const { data: existente } = await supabase.from('clientes').select('nome').eq('id', original.id).single()
    expect(existente?.nome).toBe('Nome Original')
  })

  it('rejeita chamadas de um usuário sem permissão de clientes', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...ADMIN_PROFILE, permissions: ['dashboard'] } as never)

    await expect(listDocumentosClientes()).rejects.toThrow('Acesso negado.')
    await expect(importarClientes([])).rejects.toThrow('Acesso negado.')
  })
})
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
npm test -- importar-clientes-actions
```

Esperado: PASS (3 testes) — as actions já foram criadas no Step 3.

- [ ] **Step 8: Criar a página de importação e o wrapper client**

Crie `components/clientes/importar-clientes-page-client.tsx`:

```tsx
'use client'

import { ImportadorCsv } from '@/components/importacao/importador-csv'
import { configImportacaoClientes } from './importar-clientes-config'

export function ImportarClientesPageClient() {
  return <ImportadorCsv config={configImportacaoClientes} />
}
```

Crie `app/(app)/clientes/importar/page.tsx`:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ImportarClientesPageClient } from '@/components/clientes/importar-clientes-page-client'

export default async function ImportarClientesPage() {
  await requireModuleAccess('clientes')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Importar clientes</h1>
      <ImportarClientesPageClient />
    </div>
  )
}
```

- [ ] **Step 9: Adicionar o botão na listagem**

Em `components/clientes/clientes-page-client.tsx`, troque:

```tsx
        <Link href="/clientes/novo" className={buttonVariants({ variant: 'default' })}>
          Novo cliente
        </Link>
```

por:

```tsx
        <div className="flex gap-2">
          <Link href="/clientes/importar" className={buttonVariants({ variant: 'outline' })}>
            Importar CSV
          </Link>
          <Link href="/clientes/novo" className={buttonVariants({ variant: 'default' })}>
            Novo cliente
          </Link>
        </div>
```

- [ ] **Step 10: Verificar tipos, build e suite completa**

```bash
npx tsc --noEmit
npm run build
npm test
```

Esperado: `tsc`/`build` sem erro, com `/clientes/importar` na saída do build; `npm test` com todos os testes verdes exceto os já conhecidos como rate-limited em `tests/user-actions.test.ts` (limitação externa, não relacionada).

- [ ] **Step 11: Testar manualmente**

```bash
npm run dev
```

Acesse `/clientes`, clique "Importar CSV". Monte um `.csv` com colunas `Nome,CPF/CNPJ` e 2-3 linhas (um CPF válido, um CNPJ válido, um documento inválido) — confirme que a coluna de documento é mapeada automaticamente pelo apelido, a prévia mostra "Ok"/"Erro" corretamente, e depois de importar os clientes aparecem na listagem com o tipo certo (PF/PJ).

- [ ] **Step 12: Commitar**

```bash
git add actions/cliente-actions.ts components/clientes/clientes-page-client.tsx components/clientes/importar-clientes-config.ts components/clientes/importar-clientes-page-client.tsx "app/(app)/clientes/importar" tests/importar-clientes-validacao.test.ts tests/importar-clientes-actions.test.ts
git commit -m "feat: add CSV import for clientes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Importação de Fornecedores

**Files:**
- Modify: `actions/fornecedor-actions.ts`, `components/fornecedores/fornecedores-page-client.tsx`
- Create: `components/fornecedores/importar-fornecedores-config.ts`, `components/fornecedores/importar-fornecedores-page-client.tsx`, `app/(app)/fornecedores/importar/page.tsx`
- Test: `tests/importar-fornecedores-validacao.test.ts`, `tests/importar-fornecedores-actions.test.ts`

**Interfaces:**
- Consumes: `createFornecedor` (já existente), `normalizarDocumento`/`validarDocumento` (`lib/validation/documento.ts`, sem alterações), `ConfiguracaoImportacao`/`LinhaParaImportar`/`ResultadoImportacao` (Task 1), `ImportadorCsv` (Task 2), `requireModuleAccess`, `FornecedorInput`/`Fornecedor` (`lib/types/database.ts`).
- Produces: `listDocumentosFornecedores(): Promise<string[]>`, `importarFornecedores(linhas: LinhaParaImportar<FornecedorInput>[]): Promise<ResultadoImportacao>` em `actions/fornecedor-actions.ts`; `configImportacaoFornecedores: ConfiguracaoImportacao<FornecedorInput>` em `components/fornecedores/importar-fornecedores-config.ts`.

Este módulo é idêntico ao de Clientes (Task 4) trocando `cliente(s)` por `fornecedor(es)` — mesmos campos, mesma detecção de PF/PJ, mesma estrutura de arquivos.

- [ ] **Step 1: Escrever o teste de validação de linha (falhando)**

Crie `tests/importar-fornecedores-validacao.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validarLinhaFornecedor } from '@/components/fornecedores/importar-fornecedores-config'

const LINHA_BASE = {
  documento: '',
  nome: 'Fornecedor Teste',
  nome_fantasia: '',
  telefone: '',
  email: '',
  endereco_rua: '',
  endereco_numero: '',
  endereco_bairro: '',
  endereco_cidade: '',
  endereco_uf: '',
  endereco_cep: '',
  observacoes: '',
}

describe('validarLinhaFornecedor', () => {
  it('detecta PF por CPF (11 dígitos) e normaliza pontuação', () => {
    const { valores, mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '111.444.777-35' })
    expect(mensagens).toEqual([])
    expect(valores?.tipo).toBe('pf')
    expect(valores?.documento).toBe('11144477735')
  })

  it('detecta PJ por CNPJ (14 dígitos) e normaliza pontuação', () => {
    const { valores, mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '11.222.333/0001-81' })
    expect(mensagens).toEqual([])
    expect(valores?.tipo).toBe('pj')
    expect(valores?.documento).toBe('11222333000181')
  })

  it('rejeita um CPF com dígito verificador errado', () => {
    const { valores, mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '111.444.777-36' })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Documento inválido.')
  })

  it('rejeita documento com tamanho que não é nem CPF nem CNPJ', () => {
    const { valores, mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '123' })
    expect(valores).toBeNull()
    expect(mensagens).toContain('Documento inválido.')
  })

  it('rejeita nome vazio', () => {
    const { mensagens } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '111.444.777-35', nome: '' })
    expect(mensagens).toContain('Informe o nome.')
  })

  it('aceita campos opcionais vazios como null', () => {
    const { valores } = validarLinhaFornecedor({ ...LINHA_BASE, documento: '111.444.777-35' })
    expect(valores?.telefone).toBeNull()
    expect(valores?.email).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npm test -- importar-fornecedores-validacao
```

Esperado: FAIL — `@/components/fornecedores/importar-fornecedores-config` não existe.

- [ ] **Step 3: Adicionar as Server Actions em `actions/fornecedor-actions.ts`**

Adicione no topo do arquivo, junto dos outros imports:

```ts
import type { LinhaParaImportar, ResultadoImportacao } from '@/lib/importacao/tipos'
```

E adicione ao final do arquivo:

```ts
export async function listDocumentosFornecedores(): Promise<string[]> {
  await assertModuleAccess('fornecedores')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('fornecedores').select('documento')
  if (error) throw new Error(error.message)
  return (data ?? []).map((f) => f.documento as string)
}

export async function importarFornecedores(
  linhas: LinhaParaImportar<FornecedorInput>[]
): Promise<ResultadoImportacao> {
  await assertModuleAccess('fornecedores')
  let criados = 0
  const pulados: { linha: number; motivo: string }[] = []

  for (const linha of linhas) {
    try {
      await createFornecedor(linha.valores)
      criados++
    } catch (err) {
      pulados.push({ linha: linha.numero, motivo: err instanceof Error ? err.message : 'Erro desconhecido.' })
    }
  }

  return { criados, pulados }
}
```

- [ ] **Step 4: Criar `components/fornecedores/importar-fornecedores-config.ts`**

```ts
import { listDocumentosFornecedores, importarFornecedores } from '@/actions/fornecedor-actions'
import { normalizarDocumento, validarDocumento } from '@/lib/validation/documento'
import type { CampoImportacao, ConfiguracaoImportacao } from '@/lib/importacao/tipos'
import type { FornecedorInput } from '@/lib/types/database'

const CAMPOS: CampoImportacao[] = [
  { chave: 'documento', rotulo: 'Documento (CPF/CNPJ)', obrigatorio: true, apelidos: ['cpf', 'cnpj', 'cpf/cnpj'] },
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true, apelidos: ['razao social', 'razão social'] },
  { chave: 'nome_fantasia', rotulo: 'Nome fantasia', obrigatorio: false },
  { chave: 'telefone', rotulo: 'Telefone', obrigatorio: false },
  { chave: 'email', rotulo: 'Email', obrigatorio: false },
  { chave: 'endereco_rua', rotulo: 'Rua', obrigatorio: false },
  { chave: 'endereco_numero', rotulo: 'Número', obrigatorio: false },
  { chave: 'endereco_bairro', rotulo: 'Bairro', obrigatorio: false },
  { chave: 'endereco_cidade', rotulo: 'Cidade', obrigatorio: false },
  { chave: 'endereco_uf', rotulo: 'UF', obrigatorio: false },
  { chave: 'endereco_cep', rotulo: 'CEP', obrigatorio: false },
  { chave: 'observacoes', rotulo: 'Observações', obrigatorio: false },
]

export function validarLinhaFornecedor(
  bruta: Record<string, string>
): { valores: FornecedorInput | null; mensagens: string[] } {
  const nome = bruta.nome.trim()
  const documento = normalizarDocumento(bruta.documento)

  const mensagens: string[] = []
  if (nome === '') mensagens.push('Informe o nome.')

  const tipo = documento.length === 11 ? 'pf' : documento.length === 14 ? 'pj' : null
  if (!tipo || !validarDocumento(tipo, documento)) {
    mensagens.push('Documento inválido.')
  }

  if (mensagens.length > 0) return { valores: null, mensagens }

  return {
    valores: {
      tipo: tipo as 'pf' | 'pj',
      documento,
      nome,
      nome_fantasia: bruta.nome_fantasia.trim() || null,
      telefone: bruta.telefone.trim() || null,
      email: bruta.email.trim() || null,
      endereco_rua: bruta.endereco_rua.trim() || null,
      endereco_numero: bruta.endereco_numero.trim() || null,
      endereco_bairro: bruta.endereco_bairro.trim() || null,
      endereco_cidade: bruta.endereco_cidade.trim() || null,
      endereco_uf: bruta.endereco_uf.trim() || null,
      endereco_cep: bruta.endereco_cep.trim() || null,
      observacoes: bruta.observacoes.trim() || null,
    },
    mensagens: [],
  }
}

export const configImportacaoFornecedores: ConfiguracaoImportacao<FornecedorInput> = {
  tituloModulo: 'fornecedores',
  campos: CAMPOS,
  validarLinha: validarLinhaFornecedor,
  chaveUnica: (valores) => valores.documento,
  listarChavesExistentes: listDocumentosFornecedores,
  importar: importarFornecedores,
  linkListagem: '/fornecedores',
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npm test -- importar-fornecedores-validacao
```

Esperado: PASS (6 testes).

- [ ] **Step 6: Escrever o teste de integração das Server Actions (falhando)**

Crie `tests/importar-fornecedores-actions.test.ts`:

```ts
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
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
npm test -- importar-fornecedores-actions
```

Esperado: PASS (3 testes) — as actions já foram criadas no Step 3.

- [ ] **Step 8: Criar a página de importação e o wrapper client**

Crie `components/fornecedores/importar-fornecedores-page-client.tsx`:

```tsx
'use client'

import { ImportadorCsv } from '@/components/importacao/importador-csv'
import { configImportacaoFornecedores } from './importar-fornecedores-config'

export function ImportarFornecedoresPageClient() {
  return <ImportadorCsv config={configImportacaoFornecedores} />
}
```

Crie `app/(app)/fornecedores/importar/page.tsx`:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ImportarFornecedoresPageClient } from '@/components/fornecedores/importar-fornecedores-page-client'

export default async function ImportarFornecedoresPage() {
  await requireModuleAccess('fornecedores')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Importar fornecedores</h1>
      <ImportarFornecedoresPageClient />
    </div>
  )
}
```

- [ ] **Step 9: Adicionar o botão na listagem**

Em `components/fornecedores/fornecedores-page-client.tsx`, troque:

```tsx
        <Link href="/fornecedores/novo" className={buttonVariants({ variant: 'default' })}>
          Novo fornecedor
        </Link>
```

por:

```tsx
        <div className="flex gap-2">
          <Link href="/fornecedores/importar" className={buttonVariants({ variant: 'outline' })}>
            Importar CSV
          </Link>
          <Link href="/fornecedores/novo" className={buttonVariants({ variant: 'default' })}>
            Novo fornecedor
          </Link>
        </div>
```

- [ ] **Step 10: Verificar tipos, build e suite completa**

```bash
npx tsc --noEmit
npm run build
npm test
```

Esperado: `tsc`/`build` sem erro, com `/fornecedores/importar` na saída do build; `npm test` com todos os testes verdes exceto os já conhecidos como rate-limited em `tests/user-actions.test.ts`.

- [ ] **Step 11: Testar manualmente o fluxo completo nos três módulos**

```bash
npm run dev
```

Logado como Admin:
1. Repita o teste manual do Step 11 da Task 4 agora em `/fornecedores/importar`.
2. Numa mesma sessão, monte um CSV com **duas linhas com o mesmo documento** (dentro do próprio arquivo, nenhuma delas já cadastrada) — confirme que a segunda aparece como "Já existe" na prévia (duplicidade dentro do arquivo, não contra o banco).
3. Desmarque uma linha "Ok" antes de confirmar — confirme que ela não é importada e o contador "Importar N linha(s)" reflete a seleção atual.
4. Apague os registros de teste no Supabase Cloud (SQL Editor) se algum ficou de fato gravado fora dos `afterEach` dos testes automatizados.

- [ ] **Step 12: Commitar**

```bash
git add actions/fornecedor-actions.ts components/fornecedores/fornecedores-page-client.tsx components/fornecedores/importar-fornecedores-config.ts components/fornecedores/importar-fornecedores-page-client.tsx "app/(app)/fornecedores/importar" tests/importar-fornecedores-validacao.test.ts tests/importar-fornecedores-actions.test.ts
git commit -m "feat: add CSV import for fornecedores

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
