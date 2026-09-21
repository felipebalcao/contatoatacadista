# Tela da carga, Custos extras e Pagamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a tela de detalhe `/cargas/[id]` com resumo financeiro (Custo total, Custos extras, Pago, Falta pagar) e abas Itens, Custos e Pagamentos, e mostrar Pago e Falta na listagem de cargas.

**Architecture:** Duas tabelas novas (`custos_carga`, `pagamentos_carga`) ligadas a `cargas` com `on delete cascade`, protegidas por RLS via `has_module_access('cargas')`. Server Actions novas em `actions/carga-lancamentos-actions.ts` (CRUD de custos e pagamentos, validação no servidor). Os totais nunca são gravados: uma função pura `calcularResumoCarga` (`lib/cargas/resumo.ts`) calcula tudo na hora e é usada tanto pela página de detalhe quanto por `listCargas`. A página de detalhe é um Server Component que escolhe a aba por `?aba=`; as abas Custos e Pagamentos são Client Components com tabela e um modal (o `Dialog` já existente) para criar/editar, e `router.refresh()` para atualizar os cartões.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 (strict), Tailwind CSS + shadcn/ui (`@base-ui/react`), Supabase (Postgres, RLS — projeto Cloud existente), Vitest, Vercel.

**Spec:** [docs/superpowers/specs/2026-09-21-carga-detalhe-custos-pagamentos-design.md](../specs/2026-09-21-carga-detalhe-custos-pagamentos-design.md)

## Global Constraints

- Segue a stack e convenções já estabelecidas: Next.js App Router, TypeScript `strict`, Tailwind + shadcn/ui, Supabase com RLS, Vitest, npm.
- Toda tabela nova precisa de Row Level Security habilitada. `custos_carga` e `pagamentos_carga` **têm** policy de `delete` (exceção deliberada, como `itens_carga`): o requisito é poder excluir um lançamento errado.
- Nenhum total é armazenado: Custo total, Custos extras, Pago e Falta são sempre calculados na hora por `calcularResumoCarga`.
- Fórmula: `falta = custoTotal − pago`. **Custos extras NÃO entram no "falta pagar".** `falta` negativo significa "Pago a mais" e deve aparecer em destaque, nunca escondido.
- Toda Server Action de `carga-lancamentos-actions.ts` chama `await assertModuleAccess('cargas')` como primeira linha; insert/update enumeram colunas explicitamente (nunca espalhar o input). Arquivos com `'use server'` só podem exportar funções `async` — helpers síncronos ficam sem `export`.
- Validação no servidor é a fonte da verdade: `valor` finito e `> 0`; `data` no formato `YYYY-MM-DD` e realmente existente (ex.: `2026-02-31` é inválida); `categoria` aparada e não vazia. Mensagens em português que dizem o que corrigir.
- **Gotcha conhecido deste projeto:** o `Button` de `components/ui/button.tsx` embrulha `@base-ui/react`, não Radix, e **não tem prop `asChild`**. Para um link estilizado como botão, usar `buttonVariants({ variant, size })` na `className` de um `<Link>`.
- `SUPABASE_SERVICE_ROLE_KEY` só em código server-only, nunca em Client Components.
- Toda tela sob `/cargas` protegida por `requireModuleAccess('cargas')`.
- `params` e `searchParams` das páginas são `Promise` (Next 16) e devem receber `await`.
- Modais que têm campos próprios devem resetar seus campos toda vez que abrem (`useEffect` em `open`) — um bug real de estado velho já foi encontrado e corrigido em `adicionar-produto-modal.tsx`.
- Este plano cobre só a etapa 1. Vendas, Faturamento, Lucro líquido e Devoluções são etapas futuras e ficam fora.

---

### Task 1: Migração — tabelas `custos_carga` e `pagamentos_carga`

**Files:**
- Create: `supabase/migrations/0006_cargas_lancamentos.sql`

**Interfaces:**
- Consumes: tabela `cargas` (`0005_cargas.sql`) e a função `has_module_access(module text)` (`0001_fundacao.sql`).
- Produces: tabelas `custos_carga` e `pagamentos_carga` com RLS e policies de select/insert/update/delete.

- [ ] **Step 1: Escrever a migração**

Crie `supabase/migrations/0006_cargas_lancamentos.sql`:

```sql
create table custos_carga (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  categoria text not null,
  descricao text,
  valor numeric not null check (valor > 0),
  data date not null,
  created_at timestamptz not null default now()
);

create table pagamentos_carga (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  data date not null,
  valor numeric not null check (valor > 0),
  observacao text,
  created_at timestamptz not null default now()
);

alter table custos_carga enable row level security;
alter table pagamentos_carga enable row level security;

create policy "custos_carga_select_com_acesso"
  on custos_carga for select using (has_module_access('cargas'));

create policy "custos_carga_insert_com_acesso"
  on custos_carga for insert with check (has_module_access('cargas'));

create policy "custos_carga_update_com_acesso"
  on custos_carga for update using (has_module_access('cargas'));

create policy "custos_carga_delete_com_acesso"
  on custos_carga for delete using (has_module_access('cargas'));

create policy "pagamentos_carga_select_com_acesso"
  on pagamentos_carga for select using (has_module_access('cargas'));

create policy "pagamentos_carga_insert_com_acesso"
  on pagamentos_carga for insert with check (has_module_access('cargas'));

create policy "pagamentos_carga_update_com_acesso"
  on pagamentos_carga for update using (has_module_access('cargas'));

create policy "pagamentos_carga_delete_com_acesso"
  on pagamentos_carga for delete using (has_module_access('cargas'));
```

- [ ] **Step 2: Aplicar a migração no projeto Supabase Cloud**

Este passo exige o SQL Editor do Supabase (navegador). Quem executa o plano deve pedir ao usuário para colar e rodar o conteúdo de `supabase/migrations/0006_cargas_lancamentos.sql` (Project Settings → SQL Editor).

- [ ] **Step 3: Verificar que as tabelas existem**

```bash
set -a; source .env.local; set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/custos_carga?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/pagamentos_carga?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Esperado: `[]` nas duas chamadas.

- [ ] **Step 4: Commitar**

```bash
git add supabase/migrations/0006_cargas_lancamentos.sql
git commit -m "feat: add custos_carga and pagamentos_carga tables with RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Funções puras — resumo da carga e formatação

**Files:**
- Create: `lib/cargas/resumo.ts`, `lib/formatacao.ts`
- Test: `tests/resumo-carga.test.ts`, `tests/formatacao.test.ts`

**Interfaces:**
- Produces:
  - `ResumoCarga` e `calcularResumoCarga(itens, custos, pagamentos): ResumoCarga` em `lib/cargas/resumo.ts`.
  - `formatarMoeda(valor: number): string` e `formatarData(data: string): string` em `lib/formatacao.ts`.

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `tests/resumo-carga.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcularResumoCarga } from '@/lib/cargas/resumo'

describe('calcularResumoCarga', () => {
  it('retorna zeros quando não há nada', () => {
    expect(calcularResumoCarga([], [], [])).toEqual({
      custoTotal: 0,
      custosExtras: 0,
      pago: 0,
      falta: 0,
    })
  })

  it('soma quantidade × valor unitário dos itens', () => {
    const itens = [
      { quantidade: 4, valor_unitario: 2.5 },
      { quantidade: 3.5, valor_unitario: 8 },
    ]
    expect(calcularResumoCarga(itens, [], []).custoTotal).toBe(38)
  })

  it('custos extras não entram no que falta pagar', () => {
    const resumo = calcularResumoCarga(
      [{ quantidade: 4, valor_unitario: 2.5 }],
      [{ valor: 100 }],
      [{ valor: 4 }]
    )
    expect(resumo.custosExtras).toBe(100)
    expect(resumo.pago).toBe(4)
    expect(resumo.falta).toBe(6)
  })

  it('falta zero quando o pago é igual ao custo total', () => {
    const resumo = calcularResumoCarga([{ quantidade: 4, valor_unitario: 2.5 }], [], [{ valor: 10 }])
    expect(resumo.falta).toBe(0)
  })

  it('falta negativa quando paga a mais', () => {
    const resumo = calcularResumoCarga([{ quantidade: 4, valor_unitario: 2.5 }], [], [{ valor: 12 }])
    expect(resumo.falta).toBe(-2)
  })

  it('arredonda em centavos para não acumular erro de ponto flutuante', () => {
    const resumo = calcularResumoCarga(
      [{ quantidade: 3, valor_unitario: 0.1 }],
      [],
      [{ valor: 0.1 }, { valor: 0.2 }]
    )
    expect(resumo.custoTotal).toBe(0.3)
    expect(resumo.pago).toBe(0.3)
    expect(resumo.falta).toBe(0)
  })
})
```

Crie `tests/formatacao.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatarMoeda, formatarData } from '@/lib/formatacao'

describe('formatarMoeda', () => {
  it('formata em reais com separadores brasileiros', () => {
    expect(formatarMoeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50')
  })

  it('formata zero', () => {
    expect(formatarMoeda(0).replace(/\s/g, ' ')).toBe('R$ 0,00')
  })
})

describe('formatarData', () => {
  it('converte YYYY-MM-DD em DD/MM/YYYY sem passar por Date (sem deslocar o dia)', () => {
    expect(formatarData('2026-09-20')).toBe('20/09/2026')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npm test -- resumo-carga formatacao
```

Esperado: FAIL — módulos `@/lib/cargas/resumo` e `@/lib/formatacao` não existem.

- [ ] **Step 3: Implementar**

Crie `lib/cargas/resumo.ts`:

```ts
export interface ResumoCarga {
  custoTotal: number
  custosExtras: number
  pago: number
  falta: number
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

function somar(valores: number[]): number {
  return valores.reduce((soma, valor) => soma + valor, 0)
}

export function calcularResumoCarga(
  itens: { quantidade: number; valor_unitario: number }[],
  custos: { valor: number }[],
  pagamentos: { valor: number }[]
): ResumoCarga {
  const custoTotal = centavos(somar(itens.map((item) => item.quantidade * item.valor_unitario)))
  const custosExtras = centavos(somar(custos.map((custo) => custo.valor)))
  const pago = centavos(somar(pagamentos.map((pagamento) => pagamento.valor)))

  return { custoTotal, custosExtras, pago, falta: centavos(custoTotal - pago) }
}
```

Crie `lib/formatacao.ts`:

```ts
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npm test -- resumo-carga formatacao
```

Esperado: PASS (9 testes).

- [ ] **Step 5: Commitar**

```bash
git add lib/cargas/resumo.ts lib/formatacao.ts tests/resumo-carga.test.ts tests/formatacao.test.ts
git commit -m "feat: add calcularResumoCarga and shared BRL/date formatters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Tipos e Server Actions de custos e pagamentos, Pago/Falta na listagem

**Files:**
- Modify: `lib/types/database.ts`, `actions/carga-actions.ts`
- Create: `actions/carga-lancamentos-actions.ts`
- Test: `tests/carga-lancamentos-actions.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()`, `assertModuleAccess`, `getCurrentProfile` (mock em teste), `calcularResumoCarga` (Task 2), tabelas da Task 1 (já aplicadas no banco), `createCarga` de `actions/carga-actions.ts` (para montar cargas nos testes).
- Produces:
  - Tipos `Custo`, `CustoInput`, `Pagamento`, `PagamentoInput` em `lib/types/database.ts`; `CargaResumo` ganha `pago: number` e `falta: number`.
  - `listCustos(cargaId): Promise<Custo[]>`, `createCusto(cargaId, input): Promise<Custo>`, `updateCusto(id, input): Promise<Custo>`, `deleteCusto(id): Promise<void>`
  - `listPagamentos(cargaId): Promise<Pagamento[]>`, `createPagamento(cargaId, input): Promise<Pagamento>`, `updatePagamento(id, input): Promise<Pagamento>`, `deletePagamento(id): Promise<void>`
  - `listCargas` passa a devolver `pago` e `falta`.

- [ ] **Step 1: Adicionar os tipos em `lib/types/database.ts`**

Em `CargaResumo`, adicione os dois campos novos ao final:

```ts
export interface CargaResumo {
  id: string
  nome: string
  data: string
  ativo: boolean
  fornecedor_nome: string
  total: number
  pago: number
  falta: number
}
```

E adicione ao final do arquivo:

```ts
export interface Custo {
  id: string
  carga_id: string
  categoria: string
  descricao: string | null
  valor: number
  data: string
  created_at: string
}

export interface CustoInput {
  categoria: string
  descricao: string | null
  valor: number
  data: string
}

export interface Pagamento {
  id: string
  carga_id: string
  data: string
  valor: number
  observacao: string | null
  created_at: string
}

export interface PagamentoInput {
  valor: number
  data: string
  observacao: string | null
}
```

- [ ] **Step 2: Escrever o teste de integração (falhando)**

Crie `tests/carga-lancamentos-actions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCarga, listCargas } from '@/actions/carga-actions'
import {
  listCustos,
  createCusto,
  updateCusto,
  deleteCusto,
  listPagamentos,
  createPagamento,
  updatePagamento,
  deletePagamento,
} from '@/actions/carga-lancamentos-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const DOCUMENTO_FORNECEDOR_TESTE = '99999999999'
const CODIGO_PRODUTO_TESTE = 'TESTE-LANC-A'
const NOME_FORNECEDOR_TESTE = 'Fornecedor Teste Lancamentos'
const ID_INEXISTENTE = '00000000-0000-0000-0000-000000000000'

let fornecedorId: string
let produtoId: string

async function criarCargaDeTeste(nome: string) {
  const { id } = await createCarga({
    fornecedor_id: fornecedorId,
    nome,
    data: '2026-09-20',
    itens: [{ produto_id: produtoId, quantidade: 4, valor_unitario: 2.5 }],
  })
  return id
}

describe('carga-lancamentos-actions', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()

    const { data: fornecedor, error: fornecedorError } = await supabase
      .from('fornecedores')
      .insert({ tipo: 'pf', documento: DOCUMENTO_FORNECEDOR_TESTE, nome: NOME_FORNECEDOR_TESTE })
      .select()
      .single()
    if (fornecedorError) throw fornecedorError
    fornecedorId = fornecedor.id

    const { data: produto, error: produtoError } = await supabase
      .from('produtos')
      .insert({ codigo: CODIGO_PRODUTO_TESTE, nome: 'Produto Teste Lancamentos', unidade: 'un' })
      .select()
      .single()
    if (produtoError) throw produtoError
    produtoId = produto.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('id', fornecedorId)
    await supabase.from('produtos').delete().eq('id', produtoId)
  })

  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('cargas').delete().eq('fornecedor_id', fornecedorId)
  })

  it('cria e lista um custo, aparando a categoria e guardando descrição vazia como null', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo')

    const custo = await createCusto(cargaId, {
      categoria: '  Transporte  ',
      descricao: '   ',
      valor: 150.5,
      data: '2026-09-20',
    })

    expect(custo.categoria).toBe('Transporte')
    expect(custo.descricao).toBeNull()
    expect(custo.valor).toBe(150.5)

    const custos = await listCustos(cargaId)
    expect(custos).toHaveLength(1)
    expect(custos[0].id).toBe(custo.id)
  })

  it('atualiza um custo', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Update')
    const custo = await createCusto(cargaId, { categoria: 'Descarga', descricao: null, valor: 50, data: '2026-09-20' })

    const atualizado = await updateCusto(custo.id, {
      categoria: 'Comissão',
      descricao: 'Vendedor João',
      valor: 75,
      data: '2026-09-21',
    })

    expect(atualizado.categoria).toBe('Comissão')
    expect(atualizado.descricao).toBe('Vendedor João')
    expect(atualizado.valor).toBe(75)
    expect(atualizado.data).toBe('2026-09-21')
  })

  it('exclui um custo', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Delete')
    const custo = await createCusto(cargaId, { categoria: 'Descarga', descricao: null, valor: 50, data: '2026-09-20' })

    await deleteCusto(custo.id)

    expect(await listCustos(cargaId)).toHaveLength(0)
  })

  it('rejeita custo com valor zero, negativo ou inválido', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Valor')
    const base = { categoria: 'Transporte', descricao: null, data: '2026-09-20' }

    await expect(createCusto(cargaId, { ...base, valor: 0 })).rejects.toThrow('Informe um valor maior que zero.')
    await expect(createCusto(cargaId, { ...base, valor: -5 })).rejects.toThrow('Informe um valor maior que zero.')
    await expect(createCusto(cargaId, { ...base, valor: Number.NaN })).rejects.toThrow('Informe um valor maior que zero.')
  })

  it('rejeita custo com categoria vazia ou data inválida', async () => {
    const cargaId = await criarCargaDeTeste('Carga Custo Validacao')

    await expect(
      createCusto(cargaId, { categoria: '   ', descricao: null, valor: 10, data: '2026-09-20' })
    ).rejects.toThrow('Informe a categoria.')
    await expect(
      createCusto(cargaId, { categoria: 'Transporte', descricao: null, valor: 10, data: '2026-02-31' })
    ).rejects.toThrow('Informe uma data válida.')
    await expect(
      createCusto(cargaId, { categoria: 'Transporte', descricao: null, valor: 10, data: '20/09/2026' })
    ).rejects.toThrow('Informe uma data válida.')
  })

  it('cria, lista, atualiza e exclui um pagamento', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pagamento')

    const pagamento = await createPagamento(cargaId, { valor: 3, data: '2026-09-20', observacao: '  Pix  ' })
    expect(pagamento.observacao).toBe('Pix')

    const atualizado = await updatePagamento(pagamento.id, { valor: 4, data: '2026-09-21', observacao: null })
    expect(atualizado.valor).toBe(4)
    expect(atualizado.observacao).toBeNull()
    expect(await listPagamentos(cargaId)).toHaveLength(1)

    await deletePagamento(pagamento.id)
    expect(await listPagamentos(cargaId)).toHaveLength(0)
  })

  it('rejeita pagamento com valor ou data inválidos', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pagamento Validacao')

    await expect(
      createPagamento(cargaId, { valor: 0, data: '2026-09-20', observacao: null })
    ).rejects.toThrow('Informe um valor maior que zero.')
    await expect(
      createPagamento(cargaId, { valor: 10, data: 'ontem', observacao: null })
    ).rejects.toThrow('Informe uma data válida.')
  })

  it('listCargas devolve pago e falta calculados', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pago Falta')
    await createPagamento(cargaId, { valor: 3, data: '2026-09-20', observacao: null })
    await createCusto(cargaId, { categoria: 'Transporte', descricao: null, valor: 999, data: '2026-09-20' })

    const [carga] = await listCargas('Carga Pago Falta')

    expect(carga.total).toBe(10)
    expect(carga.pago).toBe(3)
    expect(carga.falta).toBe(7)
  })

  it('listCargas mostra falta negativa quando paga a mais', async () => {
    const cargaId = await criarCargaDeTeste('Carga Pago A Mais')
    await createPagamento(cargaId, { valor: 12, data: '2026-09-20', observacao: null })

    const [carga] = await listCargas('Carga Pago A Mais')

    expect(carga.falta).toBe(-2)
  })

  it('devolve erro amigável para carga ou lançamento inexistente', async () => {
    await expect(
      createCusto(ID_INEXISTENTE, { categoria: 'Transporte', descricao: null, valor: 10, data: '2026-09-20' })
    ).rejects.toThrow('Carga não encontrada.')
    await expect(
      createPagamento(ID_INEXISTENTE, { valor: 10, data: '2026-09-20', observacao: null })
    ).rejects.toThrow('Carga não encontrada.')
    await expect(
      updateCusto(ID_INEXISTENTE, { categoria: 'Transporte', descricao: null, valor: 10, data: '2026-09-20' })
    ).rejects.toThrow('Lançamento não encontrado.')
    await expect(deleteCusto(ID_INEXISTENTE)).rejects.toThrow('Lançamento não encontrado.')
    await expect(deletePagamento(ID_INEXISTENTE)).rejects.toThrow('Lançamento não encontrado.')
  })

  it('rejeita chamadas de um usuário sem permissão de cargas', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listCustos(ID_INEXISTENTE)).rejects.toThrow('Acesso negado.')
    await expect(listPagamentos(ID_INEXISTENTE)).rejects.toThrow('Acesso negado.')
    await expect(
      createPagamento(ID_INEXISTENTE, { valor: 10, data: '2026-09-20', observacao: null })
    ).rejects.toThrow('Acesso negado.')
    await expect(deleteCusto(ID_INEXISTENTE)).rejects.toThrow('Acesso negado.')
  })
})
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

```bash
npm test -- carga-lancamentos-actions
```

Esperado: FAIL — `Cannot find module '@/actions/carga-lancamentos-actions'`.

- [ ] **Step 4: Implementar `actions/carga-lancamentos-actions.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { Custo, CustoInput, Pagamento, PagamentoInput } from '@/lib/types/database'

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
const NAO_ENCONTRADO = 'Lançamento não encontrado.'

function dataValida(data: string): boolean {
  if (!DATA_ISO.test(data)) return false
  const convertida = new Date(`${data}T00:00:00Z`)
  return !Number.isNaN(convertida.getTime()) && convertida.toISOString().slice(0, 10) === data
}

function validarValorEData(valor: number, data: string) {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Informe um valor maior que zero.')
  }
  if (!dataValida(data)) {
    throw new Error('Informe uma data válida.')
  }
}

function textoOuNulo(texto: string | null): string | null {
  const limpo = texto?.trim() ?? ''
  return limpo === '' ? null : limpo
}

function validarCusto(input: CustoInput): CustoInput {
  const categoria = input.categoria.trim()
  if (categoria === '') {
    throw new Error('Informe a categoria.')
  }
  validarValorEData(input.valor, input.data)
  return { categoria, descricao: textoOuNulo(input.descricao), valor: input.valor, data: input.data }
}

function validarPagamento(input: PagamentoInput): PagamentoInput {
  validarValorEData(input.valor, input.data)
  return { valor: input.valor, data: input.data, observacao: textoOuNulo(input.observacao) }
}

export async function listCustos(cargaId: string): Promise<Custo[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('custos_carga')
    .select('*')
    .eq('carga_id', cargaId)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Custo[]
}

export async function createCusto(cargaId: string, input: CustoInput): Promise<Custo> {
  await assertModuleAccess('cargas')
  const dados = validarCusto(input)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('custos_carga')
    .insert({
      carga_id: cargaId,
      categoria: dados.categoria,
      descricao: dados.descricao,
      valor: dados.valor,
      data: dados.data,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23503') throw new Error('Carga não encontrada.')
    throw new Error(error.message)
  }
  return data as Custo
}

export async function updateCusto(id: string, input: CustoInput): Promise<Custo> {
  await assertModuleAccess('cargas')
  const dados = validarCusto(input)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('custos_carga')
    .update({
      categoria: dados.categoria,
      descricao: dados.descricao,
      valor: dados.valor,
      data: dados.data,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new Error(NAO_ENCONTRADO)
    throw new Error(error.message)
  }
  return data as Custo
}

export async function deleteCusto(id: string): Promise<void> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('custos_carga').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error(NAO_ENCONTRADO)
}

export async function listPagamentos(cargaId: string): Promise<Pagamento[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagamentos_carga')
    .select('*')
    .eq('carga_id', cargaId)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Pagamento[]
}

export async function createPagamento(cargaId: string, input: PagamentoInput): Promise<Pagamento> {
  await assertModuleAccess('cargas')
  const dados = validarPagamento(input)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagamentos_carga')
    .insert({
      carga_id: cargaId,
      valor: dados.valor,
      data: dados.data,
      observacao: dados.observacao,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23503') throw new Error('Carga não encontrada.')
    throw new Error(error.message)
  }
  return data as Pagamento
}

export async function updatePagamento(id: string, input: PagamentoInput): Promise<Pagamento> {
  await assertModuleAccess('cargas')
  const dados = validarPagamento(input)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagamentos_carga')
    .update({
      valor: dados.valor,
      data: dados.data,
      observacao: dados.observacao,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new Error(NAO_ENCONTRADO)
    throw new Error(error.message)
  }
  return data as Pagamento
}

export async function deletePagamento(id: string): Promise<void> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('pagamentos_carga').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error(NAO_ENCONTRADO)
}
```

- [ ] **Step 5: Atualizar `listCargas` para devolver `pago` e `falta`**

Em `actions/carga-actions.ts`, adicione o import no topo (junto dos outros):

```ts
import { calcularResumoCarga } from '@/lib/cargas/resumo'
```

Troque o `.select(...)` de `listCargas` para incluir os pagamentos:

```ts
    .select('id, nome, data, ativo, fornecedores(nome), itens_carga(quantidade, valor_unitario), pagamentos_carga(valor)')
```

E troque o corpo do `map` (o objeto retornado) por:

```ts
  const cargas: CargaResumo[] = (data ?? []).map((c) => {
    const fornecedor = c.fornecedores as unknown as { nome: string } | null
    const itens = (c.itens_carga ?? []) as unknown as { quantidade: number; valor_unitario: number }[]
    const pagamentos = (c.pagamentos_carga ?? []) as unknown as { valor: number }[]
    const resumo = calcularResumoCarga(itens, [], pagamentos)
    return {
      id: c.id,
      nome: c.nome,
      data: c.data,
      ativo: c.ativo,
      fornecedor_nome: fornecedor?.nome ?? '',
      total: resumo.custoTotal,
      pago: resumo.pago,
      falta: resumo.falta,
    }
  })
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

```bash
npm test -- carga-lancamentos-actions carga-actions
npx tsc --noEmit
```

Esperado: PASS (11 testes novos + os 8 de `carga-actions`); `tsc` sem erro.

- [ ] **Step 7: Commitar**

```bash
git add lib/types/database.ts actions/carga-actions.ts actions/carga-lancamentos-actions.ts tests/carga-lancamentos-actions.test.ts
git commit -m "feat: add custos and pagamentos actions, expose pago/falta in listCargas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Listagem — link para o detalhe, colunas Pago e Falta

**Files:**
- Modify: `components/cargas/cargas-table.tsx`

**Interfaces:**
- Consumes: `CargaResumo` com `pago`/`falta` (Task 3), `formatarMoeda`/`formatarData` (`lib/formatacao.ts`, Task 2).

- [ ] **Step 1: Reescrever `components/cargas/cargas-table.tsx`**

Substitua o arquivo inteiro por:

```tsx
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { formatarData, formatarMoeda } from '@/lib/formatacao'
import type { CargaResumo } from '@/lib/types/database'

function FaltaPagar({ falta }: { falta: number }) {
  if (falta < 0) {
    return <span className="text-amber-700">Pago a mais {formatarMoeda(Math.abs(falta))}</span>
  }
  if (falta === 0) {
    return <span className="text-emerald-700">{formatarMoeda(0)}</span>
  }
  return <span>{formatarMoeda(falta)}</span>
}

export function CargasTable({
  cargas,
  onToggleAtivo,
}: {
  cargas: CargaResumo[]
  onToggleAtivo: (id: string, ativo: boolean) => void
}) {
  if (cargas.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Nenhuma carga cadastrada ainda.
      </p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Nome</th>
          <th className="py-2">Fornecedor</th>
          <th className="py-2">Data</th>
          <th className="py-2">Total</th>
          <th className="py-2">Pago</th>
          <th className="py-2">Falta pagar</th>
          <th className="py-2">Status</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {cargas.map((carga) => (
          <tr key={carga.id} className="border-b">
            <td className="py-2">
              <Link href={`/cargas/${carga.id}`} className="font-medium text-slate-900 hover:underline">
                {carga.nome}
              </Link>
            </td>
            <td className="py-2">{carga.fornecedor_nome}</td>
            <td className="py-2">{formatarData(carga.data)}</td>
            <td className="py-2">{formatarMoeda(carga.total)}</td>
            <td className="py-2">{formatarMoeda(carga.pago)}</td>
            <td className="py-2">
              <FaltaPagar falta={carga.falta} />
            </td>
            <td className="py-2">
              <span
                className={
                  carga.ativo
                    ? 'text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 text-xs'
                    : 'text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 text-xs'
                }
              >
                {carga.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            <td className="py-2 text-right space-x-2">
              <Link href={`/cargas/${carga.id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Editar
              </Link>
              <Button variant="ghost" size="sm" onClick={() => onToggleAtivo(carga.id, !carga.ativo)}>
                {carga.ativo ? 'Inativar' : 'Reativar'}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Verificar tipos e build**

```bash
npx tsc --noEmit
npm run build
```

Esperado: ambos sem erro. (O link do nome já aponta para `/cargas/[id]`, criada na Task 5.)

- [ ] **Step 3: Commitar**

```bash
git add components/cargas/cargas-table.tsx
git commit -m "feat: link cargas to detail screen and show pago/falta columns

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Tela de detalhe `/cargas/[id]` — cabeçalho, cartões, abas e aba Itens

**Files:**
- Create: `app/(app)/cargas/[id]/page.tsx`, `components/cargas/carga-resumo-cards.tsx`, `components/cargas/carga-abas.tsx`, `components/cargas/carga-itens-tabela.tsx`

**Interfaces:**
- Consumes: `getCarga` (`actions/carga-actions.ts`), `listCustos`/`listPagamentos` (Task 3), `calcularResumoCarga`/`ResumoCarga` (Task 2), `formatarMoeda`/`formatarData` (Task 2), `requireModuleAccess`, `buttonVariants`.
- Produces: `AbaCarga` e `ABAS_CARGA` exportados de `carga-abas.tsx` (as Tasks 6 e 7 encaixam suas abas na página).

- [ ] **Step 1: Criar `components/cargas/carga-resumo-cards.tsx`**

```tsx
import { formatarMoeda } from '@/lib/formatacao'
import type { ResumoCarga } from '@/lib/cargas/resumo'

export function CargaResumoCards({ resumo }: { resumo: ResumoCarga }) {
  const pagoAMais = resumo.falta < 0

  const cartoes = [
    { rotulo: 'Custo total', valor: formatarMoeda(resumo.custoTotal), alerta: false },
    { rotulo: 'Custos extras', valor: formatarMoeda(resumo.custosExtras), alerta: false },
    { rotulo: 'Pago', valor: formatarMoeda(resumo.pago), alerta: false },
    {
      rotulo: pagoAMais ? 'Pago a mais' : 'Falta pagar',
      valor: formatarMoeda(Math.abs(resumo.falta)),
      alerta: pagoAMais,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cartoes.map((cartao) => (
        <div
          key={cartao.rotulo}
          className={`rounded-2xl border p-4 ${
            cartao.alerta ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
          }`}
        >
          <p className={`text-xs ${cartao.alerta ? 'text-amber-700' : 'text-slate-500'}`}>{cartao.rotulo}</p>
          <p className={`mt-1 text-lg font-semibold ${cartao.alerta ? 'text-amber-900' : 'text-slate-900'}`}>
            {cartao.valor}
          </p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Criar `components/cargas/carga-abas.tsx`**

```tsx
import Link from 'next/link'

export type AbaCarga = 'itens' | 'custos' | 'pagamentos'

export const ABAS_CARGA: { chave: AbaCarga; rotulo: string }[] = [
  { chave: 'itens', rotulo: 'Itens' },
  { chave: 'custos', rotulo: 'Custos' },
  { chave: 'pagamentos', rotulo: 'Pagamentos' },
]

export function CargaAbas({ cargaId, ativa }: { cargaId: string; ativa: AbaCarga }) {
  return (
    <nav aria-label="Seções da carga" className="flex gap-1 border-b border-slate-200">
      {ABAS_CARGA.map((aba) => (
        <Link
          key={aba.chave}
          href={`/cargas/${cargaId}?aba=${aba.chave}`}
          aria-current={ativa === aba.chave ? 'page' : undefined}
          className={`-mb-px border-b-2 px-4 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 ${
            ativa === aba.chave
              ? 'border-slate-900 font-medium text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Criar `components/cargas/carga-itens-tabela.tsx`**

```tsx
import { formatarMoeda } from '@/lib/formatacao'
import type { ItemCarga } from '@/lib/types/database'

export function CargaItensTabela({ itens }: { itens: ItemCarga[] }) {
  if (itens.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Esta carga não tem itens.
      </p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Produto</th>
          <th className="py-2">Quantidade</th>
          <th className="py-2">Valor unitário</th>
          <th className="py-2">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((item) => (
          <tr key={item.id} className="border-b">
            <td className="py-2">
              {item.produto_codigo} — {item.produto_nome}
            </td>
            <td className="py-2">
              {item.quantidade} {item.produto_unidade}
            </td>
            <td className="py-2">{formatarMoeda(item.valor_unitario)}</td>
            <td className="py-2">{formatarMoeda(item.quantidade * item.valor_unitario)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Criar `app/(app)/cargas/[id]/page.tsx`**

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getCarga } from '@/actions/carga-actions'
import { listCustos, listPagamentos } from '@/actions/carga-lancamentos-actions'
import { calcularResumoCarga } from '@/lib/cargas/resumo'
import { formatarData } from '@/lib/formatacao'
import { buttonVariants } from '@/components/ui/button'
import { CargaResumoCards } from '@/components/cargas/carga-resumo-cards'
import { CargaAbas, ABAS_CARGA, type AbaCarga } from '@/components/cargas/carga-abas'
import { CargaItensTabela } from '@/components/cargas/carga-itens-tabela'

export default async function CargaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aba?: string }>
}) {
  await requireModuleAccess('cargas')
  const { id } = await params
  const { aba } = await searchParams
  const abaAtiva: AbaCarga = ABAS_CARGA.some((a) => a.chave === aba) ? (aba as AbaCarga) : 'itens'

  const carga = await getCarga(id)
  if (!carga) {
    notFound()
  }

  const [custos, pagamentos] = await Promise.all([listCustos(id), listPagamentos(id)])
  const resumo = calcularResumoCarga(carga.itens, custos, pagamentos)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{carga.nome}</h1>
            {!carga.ativo && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inativa</span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {carga.fornecedor_nome} · {formatarData(carga.data)}
          </p>
        </div>
        <Link href={`/cargas/${carga.id}/editar`} className={buttonVariants({ variant: 'outline' })}>
          Editar carga
        </Link>
      </div>

      <CargaResumoCards resumo={resumo} />

      <div className="space-y-4">
        <CargaAbas cargaId={carga.id} ativa={abaAtiva} />
        {abaAtiva === 'itens' && <CargaItensTabela itens={carga.itens} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verificar tipos e build**

```bash
npx tsc --noEmit
npm run build
```

Esperado: ambos sem erro, com `/cargas/[id]` na saída do build.

- [ ] **Step 6: Commitar**

```bash
git add "app/(app)/cargas/[id]/page.tsx" components/cargas/carga-resumo-cards.tsx components/cargas/carga-abas.tsx components/cargas/carga-itens-tabela.tsx
git commit -m "feat: add carga detail screen with summary cards, tabs and items tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Aba Custos — tabela, modal de criar/editar, excluir

**Files:**
- Create: `components/cargas/custo-modal.tsx`, `components/cargas/custos-secao.tsx`
- Modify: `app/(app)/cargas/[id]/page.tsx`

**Interfaces:**
- Consumes: `createCusto`/`updateCusto`/`deleteCusto` (Task 3), `Custo`/`CustoInput` (Task 3), `Dialog`/`DialogContent`/`DialogTitle`, `dataHojeSaoPaulo` (`lib/cargas/data-hoje.ts`), `formatarMoeda`/`formatarData`.
- Produces: `CustosSecao({ cargaId, custos, dataPadrao })` usado pela página.

- [ ] **Step 1: Criar `components/cargas/custo-modal.tsx`**

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCusto, updateCusto } from '@/actions/carga-lancamentos-actions'
import type { Custo, CustoInput } from '@/lib/types/database'

const CATEGORIAS_SUGERIDAS = ['Transporte', 'Comissão', 'Descarga']

export function CustoModal({
  open,
  onOpenChange,
  cargaId,
  custo,
  dataPadrao,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cargaId: string
  custo: Custo | null
  dataPadrao: string
}) {
  const router = useRouter()
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setCategoria(custo?.categoria ?? '')
      setDescricao(custo?.descricao ?? '')
      setValor(custo ? String(custo.valor) : '')
      setData(custo?.data ?? dataPadrao)
      setError(null)
    }
  }, [open, custo, dataPadrao])

  function handleSalvar() {
    setError(null)
    const valorNum = Number(valor)

    if (categoria.trim() === '') {
      setError('Informe a categoria.')
      return
    }
    if (valor.trim() === '' || !Number.isFinite(valorNum) || valorNum <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }
    if (data === '') {
      setError('Informe uma data válida.')
      return
    }

    const input: CustoInput = {
      categoria,
      descricao: descricao.trim() === '' ? null : descricao,
      valor: valorNum,
      data,
    }

    startTransition(async () => {
      try {
        if (custo) {
          await updateCusto(custo.id, input)
        } else {
          await createCusto(cargaId, input)
        }
        onOpenChange(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar o custo.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{custo ? 'Editar custo' : 'Novo custo'}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleSalvar()
          }}
          className="mt-4 space-y-4"
        >
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custo-categoria">Categoria</Label>
            <Input
              id="custo-categoria"
              list="custo-categorias"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Transporte, Comissão, Descarga..."
            />
            <datalist id="custo-categorias">
              {CATEGORIAS_SUGERIDAS.map((sugestao) => (
                <option key={sugestao} value={sugestao} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custo-descricao">Descrição (opcional)</Label>
            <Input id="custo-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="custo-valor">Valor (R$)</Label>
              <Input
                id="custo-valor"
                type="number"
                step="any"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="custo-data">Data</Label>
              <Input id="custo-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Criar `components/cargas/custos-secao.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteCusto } from '@/actions/carga-lancamentos-actions'
import { formatarData, formatarMoeda } from '@/lib/formatacao'
import { CustoModal } from './custo-modal'
import type { Custo } from '@/lib/types/database'

export function CustosSecao({
  cargaId,
  custos,
  dataPadrao,
}: {
  cargaId: string
  custos: Custo[]
  dataPadrao: string
}) {
  const router = useRouter()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Custo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrirNovo() {
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(custo: Custo) {
    setEditando(custo)
    setModalAberto(true)
  }

  function handleExcluir(custo: Custo) {
    if (!window.confirm(`Excluir o custo "${custo.categoria}" de ${formatarMoeda(custo.valor)}?`)) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteCusto(custo.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao excluir o custo.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          Custos além do valor dos itens: transporte, comissão, descarga e outros.
        </p>
        <Button type="button" onClick={abrirNovo}>
          Novo custo
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {custos.length === 0 ? (
        <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
          Nenhum custo lançado ainda.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Data</th>
              <th className="py-2">Categoria</th>
              <th className="py-2">Descrição</th>
              <th className="py-2">Valor</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {custos.map((custo) => (
              <tr key={custo.id} className="border-b">
                <td className="py-2">{formatarData(custo.data)}</td>
                <td className="py-2">{custo.categoria}</td>
                <td className="py-2 text-slate-500">{custo.descricao ?? '—'}</td>
                <td className="py-2">{formatarMoeda(custo.valor)}</td>
                <td className="py-2 text-right space-x-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => abrirEdicao(custo)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleExcluir(custo)}
                  >
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CustoModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        cargaId={cargaId}
        custo={editando}
        dataPadrao={dataPadrao}
      />
    </div>
  )
}
```

- [ ] **Step 3: Encaixar a aba na página**

Em `app/(app)/cargas/[id]/page.tsx`, adicione os imports:

```tsx
import { dataHojeSaoPaulo } from '@/lib/cargas/data-hoje'
import { CustosSecao } from '@/components/cargas/custos-secao'
```

E, logo abaixo da linha `{abaAtiva === 'itens' && <CargaItensTabela itens={carga.itens} />}`, adicione:

```tsx
        {abaAtiva === 'custos' && (
          <CustosSecao cargaId={carga.id} custos={custos} dataPadrao={dataHojeSaoPaulo()} />
        )}
```

- [ ] **Step 4: Verificar tipos e build**

```bash
npx tsc --noEmit
npm run build
```

Esperado: ambos sem erro.

- [ ] **Step 5: Commitar**

```bash
git add components/cargas/custo-modal.tsx components/cargas/custos-secao.tsx "app/(app)/cargas/[id]/page.tsx"
git commit -m "feat: add Custos tab with create/edit modal and delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Aba Pagamentos — tabela, modal de criar/editar, excluir

**Files:**
- Create: `components/cargas/pagamento-modal.tsx`, `components/cargas/pagamentos-secao.tsx`
- Modify: `app/(app)/cargas/[id]/page.tsx`

**Interfaces:**
- Consumes: `createPagamento`/`updatePagamento`/`deletePagamento`, `Pagamento`/`PagamentoInput` (Task 3), `Dialog`, `dataHojeSaoPaulo`, `formatarMoeda`/`formatarData`.
- Produces: `PagamentosSecao({ cargaId, pagamentos, dataPadrao })` usado pela página.

- [ ] **Step 1: Criar `components/cargas/pagamento-modal.tsx`**

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createPagamento, updatePagamento } from '@/actions/carga-lancamentos-actions'
import type { Pagamento, PagamentoInput } from '@/lib/types/database'

export function PagamentoModal({
  open,
  onOpenChange,
  cargaId,
  pagamento,
  dataPadrao,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cargaId: string
  pagamento: Pagamento | null
  dataPadrao: string
}) {
  const router = useRouter()
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [observacao, setObservacao] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setValor(pagamento ? String(pagamento.valor) : '')
      setData(pagamento?.data ?? dataPadrao)
      setObservacao(pagamento?.observacao ?? '')
      setError(null)
    }
  }, [open, pagamento, dataPadrao])

  function handleSalvar() {
    setError(null)
    const valorNum = Number(valor)

    if (valor.trim() === '' || !Number.isFinite(valorNum) || valorNum <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }
    if (data === '') {
      setError('Informe uma data válida.')
      return
    }

    const input: PagamentoInput = {
      valor: valorNum,
      data,
      observacao: observacao.trim() === '' ? null : observacao,
    }

    startTransition(async () => {
      try {
        if (pagamento) {
          await updatePagamento(pagamento.id, input)
        } else {
          await createPagamento(cargaId, input)
        }
        onOpenChange(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar o pagamento.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{pagamento ? 'Editar pagamento' : 'Novo pagamento'}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleSalvar()
          }}
          className="mt-4 space-y-4"
        >
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pagamento-valor">Valor (R$)</Label>
              <Input
                id="pagamento-valor"
                type="number"
                step="any"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pagamento-data">Data</Label>
              <Input id="pagamento-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pagamento-observacao">Observação (opcional)</Label>
            <Input
              id="pagamento-observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Pix, boleto, parcela 1 de 3..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Criar `components/cargas/pagamentos-secao.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deletePagamento } from '@/actions/carga-lancamentos-actions'
import { formatarData, formatarMoeda } from '@/lib/formatacao'
import { PagamentoModal } from './pagamento-modal'
import type { Pagamento } from '@/lib/types/database'

export function PagamentosSecao({
  cargaId,
  pagamentos,
  dataPadrao,
}: {
  cargaId: string
  pagamentos: Pagamento[]
  dataPadrao: string
}) {
  const router = useRouter()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Pagamento | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrirNovo() {
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(pagamento: Pagamento) {
    setEditando(pagamento)
    setModalAberto(true)
  }

  function handleExcluir(pagamento: Pagamento) {
    if (!window.confirm(`Excluir o pagamento de ${formatarMoeda(pagamento.valor)} em ${formatarData(pagamento.data)}?`)) return
    setError(null)
    startTransition(async () => {
      try {
        await deletePagamento(pagamento.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao excluir o pagamento.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">Pagamentos feitos ao fornecedor por esta carga.</p>
        <Button type="button" onClick={abrirNovo}>
          Novo pagamento
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {pagamentos.length === 0 ? (
        <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
          Nenhum pagamento lançado ainda.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Data</th>
              <th className="py-2">Valor</th>
              <th className="py-2">Observação</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pagamentos.map((pagamento) => (
              <tr key={pagamento.id} className="border-b">
                <td className="py-2">{formatarData(pagamento.data)}</td>
                <td className="py-2">{formatarMoeda(pagamento.valor)}</td>
                <td className="py-2 text-slate-500">{pagamento.observacao ?? '—'}</td>
                <td className="py-2 text-right space-x-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => abrirEdicao(pagamento)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleExcluir(pagamento)}
                  >
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <PagamentoModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        cargaId={cargaId}
        pagamento={editando}
        dataPadrao={dataPadrao}
      />
    </div>
  )
}
```

- [ ] **Step 3: Encaixar a aba na página**

Em `app/(app)/cargas/[id]/page.tsx`, adicione o import:

```tsx
import { PagamentosSecao } from '@/components/cargas/pagamentos-secao'
```

E, logo abaixo do bloco `{abaAtiva === 'custos' && (...)}`, adicione:

```tsx
        {abaAtiva === 'pagamentos' && (
          <PagamentosSecao cargaId={carga.id} pagamentos={pagamentos} dataPadrao={dataHojeSaoPaulo()} />
        )}
```

- [ ] **Step 4: Verificar tipos, build e suite completa**

```bash
npx tsc --noEmit
npm run build
npm test
```

Esperado: `tsc`/`build` sem erro; `npm test` verde (a suite completa inclui os testes das Tasks 2 e 3).

- [ ] **Step 5: Testar manualmente o fluxo completo**

```bash
npm run dev
```

Logado como Admin, com uma carga já cadastrada (crie uma em `/cargas/novo` se necessário):
1. Em `/cargas`, clique no nome da carga — confirme que abre `/cargas/[id]` com os quatro cartões (Custo total = soma dos itens, os demais em R$ 0,00) e a aba Itens.
2. Alterne entre Itens, Custos e Pagamentos — confirme que a aba ativa fica sublinhada e a URL muda (`?aba=`).
3. Em Custos, clique "Novo custo": categoria (confirme as sugestões Transporte/Comissão/Descarga), valor, data já preenchida com hoje. Salve — confirme a linha na tabela e o cartão "Custos extras" atualizado.
4. Edite o custo e exclua-o (confirme o aviso antes de excluir) — confirme os cartões atualizando.
5. Tente salvar um custo com valor 0 e com categoria vazia — confirme a mensagem de erro no modal, sem fechar.
6. Em Pagamentos, lance um pagamento menor que o custo total — confirme "Pago" e "Falta pagar" corretos. Lance um pagamento maior — confirme que o cartão muda para "Pago a mais", em destaque âmbar.
7. Feche o modal com Esc e reabra "Novo pagamento" — confirme que os campos voltam vazios (data de hoje).
8. Volte a `/cargas` e confirme as colunas Pago e Falta pagar coerentes com o detalhe.
9. Apague os dados de teste no Supabase (SQL Editor: `delete from cargas where nome = '<nome usado>';` — o cascade remove custos e pagamentos) se a carga foi só de teste.

- [ ] **Step 6: Commitar**

```bash
git add components/cargas/pagamento-modal.tsx components/cargas/pagamentos-secao.tsx "app/(app)/cargas/[id]/page.tsx"
git commit -m "feat: add Pagamentos tab with create/edit modal and delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
