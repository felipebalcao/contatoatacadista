# Cadastro de Produtos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder "em construção" de `/produtos` por um CRUD completo de produtos (código, código de barras, nome, unidade, categoria), com busca e inativação, construído sobre a autenticação/autorização já existente da Fundação.

**Architecture:** Nova tabela `produtos` no mesmo projeto Supabase Cloud da Fundação, protegida por RLS reaproveitando `has_module_access('produtos')` — o `module_key` `produtos` já existe desde a Fundação, então nenhum registro de módulo é necessário (diferente de Fornecedores). Server Actions em `actions/produto-actions.ts` seguem o padrão hardened de `actions/cliente-actions.ts`/`actions/fornecedor-actions.ts` (`assertModuleAccess` na primeira linha, colunas explícitas no insert/update, filtro de busca com aspas duplas via `quotePostgrestValue`). UI em páginas dedicadas, reaproveitando os componentes `Button`/`Input`/`Label` já usados nos outros módulos. Sem toggle PF/PJ nem validação de documento — o formulário é mais simples que o de Clientes/Fornecedores.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 (strict), Tailwind CSS + shadcn/ui (`@base-ui/react`), Supabase (Postgres, Auth, RLS — projeto Cloud existente), Vitest, Vercel.

**Spec:** [docs/superpowers/specs/2026-09-03-produtos-design.md](../specs/2026-09-03-produtos-design.md)

## Global Constraints

- Segue a stack e convenções já estabelecidas: Next.js App Router, TypeScript `strict`, Tailwind + shadcn/ui (nenhuma outra lib de UI), Supabase com RLS, Vitest, npm.
- Toda tabela nova precisa de Row Level Security habilitada — nunca deixar tabela sem policy.
- `codigo` é digitado por quem cadastra (não gerado pelo sistema), é `unique` a nível de banco, e a Server Action traduz a violação (Postgres `23505`) em mensagem amigável: "Já existe um produto cadastrado com esse código."
- `codigo_barras` e `categoria` são opcionais (`string | null`), sem validação de formato.
- Sem exclusão física de produto pela aplicação — toda "remoção" é `ativo=false` via `toggleProdutoAtivo`. Nenhuma policy de `delete` na tabela `produtos`.
- Toda Server Action exportada em `produto-actions.ts` chama `await assertModuleAccess('produtos')` como primeira linha — nunca confiar só em `requireModuleAccess` na página.
- Busca por nome/código usa `quotePostgrestValue` (aspas duplas), não escapar vírgula/parênteses com backslash — o PostgREST não honra escaping de vírgula dentro de `.or()` fora de aspas duplas.
- Insert/update sempre enumeram colunas explicitamente — nunca espalhar (`...input`) o objeto de input bruto direto na chamada do Supabase (proteção contra mass-assignment).
- **Gotcha conhecido deste projeto:** o `Button` de `components/ui/button.tsx` embrulha `@base-ui/react`, não Radix, e **não tem prop `asChild`**. Para um link estilizado como botão, usar `buttonVariants({ variant, size })` aplicado à `className` de um `<Link>` normal.
- `SUPABASE_SERVICE_ROLE_KEY` só em código server-only (`'use server'` ou `lib/supabase/admin.ts`), nunca em Client Components.
- Toda tela sob `/produtos` protegida por `requireModuleAccess('produtos')` (redireciona para `/acesso-negado`), mesmo padrão de Clientes/Fornecedores/Usuários.

---

### Task 1: Migração do banco — tabela `produtos` e RLS

**Files:**
- Create: `supabase/migrations/0004_produtos.sql`

**Interfaces:**
- Consumes: função `has_module_access(module text) returns boolean` (`0001_fundacao.sql`).
- Produces: tabela `produtos` com RLS habilitada, policies de select/insert/update checando `has_module_access('produtos')`.

- [ ] **Step 1: Escrever a migração**

Crie `supabase/migrations/0004_produtos.sql`:

```sql
create table produtos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  codigo_barras text,
  nome text not null,
  unidade text not null,
  categoria text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table produtos enable row level security;

create policy "produtos_select_com_acesso"
  on produtos for select using (has_module_access('produtos'));

create policy "produtos_insert_com_acesso"
  on produtos for insert with check (has_module_access('produtos'));

create policy "produtos_update_com_acesso"
  on produtos for update using (has_module_access('produtos'));
```

- [ ] **Step 2: Aplicar a migração no projeto Supabase Cloud**

Este projeto não usa Supabase local. Abra o SQL Editor do projeto Supabase Cloud (Project Settings → SQL Editor) e execute o conteúdo de `supabase/migrations/0004_produtos.sql`.

- [ ] **Step 3: Verificar que a tabela foi criada com RLS ativa**

```bash
set -a; source .env.local; set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/produtos?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Esperado: `[]` (tabela vazia, sem erro — confirma que a tabela existe e a policy de select libera o service role).

Não é necessário verificar `role_permissions`/Admin nesta task — `produtos` já é um `module_key` válido e o Admin já tem essa permissão desde o seed original da Fundação (`0001_fundacao.sql`), diferente de Fornecedores.

- [ ] **Step 4: Commitar**

```bash
git add supabase/migrations/0004_produtos.sql
git commit -m "feat: add produtos table with RLS reusing has_module_access

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos e Server Actions de produtos

**Files:**
- Modify: `lib/types/database.ts`
- Create: `actions/produto-actions.ts`
- Test: `tests/produto-actions.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()` (`lib/supabase/admin.ts`), `assertModuleAccess` (`lib/auth/assert-module-access.ts`), `getCurrentProfile` (`lib/auth/get-current-profile.ts`, para mock em teste).
- Produces:
  - Tipos `Produto`, `ProdutoInput` em `lib/types/database.ts`.
  - `listProdutos(query?: string): Promise<Produto[]>`
  - `getProduto(id: string): Promise<Produto | null>`
  - `createProduto(input: ProdutoInput): Promise<Produto>`
  - `updateProduto(id: string, input: ProdutoInput): Promise<Produto>`
  - `toggleProdutoAtivo(id: string, ativo: boolean): Promise<void>`
  - todas em `actions/produto-actions.ts`.

- [ ] **Step 1: Adicionar os tipos em `lib/types/database.ts`**

Adicione ao final do arquivo:

```ts
export interface Produto {
  id: string
  codigo: string
  codigo_barras: string | null
  nome: string
  unidade: string
  categoria: string | null
  ativo: boolean
  created_at: string
}

export interface ProdutoInput {
  codigo: string
  codigo_barras: string | null
  nome: string
  unidade: string
  categoria: string | null
}
```

- [ ] **Step 2: Escrever o teste de integração das Server Actions (falhando)**

Crie `tests/produto-actions.test.ts`:

```ts
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createProduto,
  updateProduto,
  listProdutos,
  toggleProdutoAtivo,
} from '@/actions/produto-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { ProdutoInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const CODIGO_TESTE = 'TESTE-0001'

const inputBase: ProdutoInput = {
  codigo: CODIGO_TESTE,
  codigo_barras: null,
  nome: 'Produto Teste',
  unidade: 'un',
  categoria: null,
}

describe('produto-actions', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('produtos').delete().in('codigo', [CODIGO_TESTE, 'TESTE-0002'])
  })

  it('cria um produto válido', async () => {
    const produto = await createProduto(inputBase)

    expect(produto.codigo).toBe(CODIGO_TESTE)
    expect(produto.ativo).toBe(true)
  })

  it('rejeita código duplicado', async () => {
    await createProduto({ ...inputBase, nome: 'Primeiro Cadastro' })

    await expect(
      createProduto({ ...inputBase, nome: 'Segundo Cadastro' })
    ).rejects.toThrow('Já existe um produto cadastrado com esse código.')
  })

  it('atualiza um produto existente', async () => {
    const produto = await createProduto({ ...inputBase, nome: 'Nome Original' })

    const atualizado = await updateProduto(produto.id, { ...inputBase, nome: 'Nome Atualizado' })

    expect(atualizado.nome).toBe('Nome Atualizado')
  })

  it('lista produtos filtrando por nome, excluindo os que não combinam', async () => {
    await createProduto({ ...inputBase, nome: 'Produto Buscável' })
    await createProduto({
      ...inputBase,
      codigo: 'TESTE-0002',
      nome: 'Outro Item Qualquer',
    })

    const resultados = await listProdutos('Buscável')

    expect(resultados.some((p) => p.codigo === CODIGO_TESTE)).toBe(true)
    expect(resultados.some((p) => p.codigo === 'TESTE-0002')).toBe(false)
  })

  it('inativa e reativa um produto', async () => {
    const produto = await createProduto(inputBase)

    await toggleProdutoAtivo(produto.id, false)
    let lista = await listProdutos()
    expect(lista.find((p) => p.id === produto.id)?.ativo).toBe(false)

    await toggleProdutoAtivo(produto.id, true)
    lista = await listProdutos()
    expect(lista.find((p) => p.id === produto.id)?.ativo).toBe(true)
  })

  it('rejeita chamadas de um usuário sem permissão de produtos', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listProdutos()).rejects.toThrow('Acesso negado.')
  })

  it('busca por nome contendo vírgula não quebra o filtro', async () => {
    await createProduto({ ...inputBase, nome: 'Produto, Com Vírgula' })

    const resultados = await listProdutos('Produto, Com Vírgula')

    expect(resultados.some((p) => p.codigo === CODIGO_TESTE)).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

```bash
npm test -- produto-actions
```

Esperado: FAIL — `Cannot find module '@/actions/produto-actions'`.

- [ ] **Step 4: Implementar `actions/produto-actions.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { Produto, ProdutoInput } from '@/lib/types/database'

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

export async function listProdutos(query?: string): Promise<Produto[]> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  let request = supabase.from('produtos').select('*').order('nome')

  if (query) {
    const valorBusca = quotePostgrestValue(`%${query}%`)
    request = request.or(`nome.ilike.${valorBusca},codigo.ilike.${valorBusca}`)
  }

  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data ?? []) as Produto[]
}

export async function getProduto(id: string): Promise<Produto | null> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data } = await supabase.from('produtos').select('*').eq('id', id).single()
  return (data as Produto) ?? null
}

export async function createProduto(input: ProdutoInput): Promise<Produto> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('produtos')
    .insert({
      codigo: input.codigo,
      codigo_barras: input.codigo_barras,
      nome: input.nome,
      unidade: input.unidade,
      categoria: input.categoria,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um produto cadastrado com esse código.')
    }
    throw new Error(error.message)
  }

  return data as Produto
}

export async function updateProduto(id: string, input: ProdutoInput): Promise<Produto> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('produtos')
    .update({
      codigo: input.codigo,
      codigo_barras: input.codigo_barras,
      nome: input.nome,
      unidade: input.unidade,
      categoria: input.categoria,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um produto cadastrado com esse código.')
    }
    throw new Error(error.message)
  }

  return data as Produto
}

export async function toggleProdutoAtivo(id: string, ativo: boolean): Promise<void> {
  await assertModuleAccess('produtos')
  const supabase = createAdminClient()
  const { error } = await supabase.from('produtos').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

```bash
npm test -- produto-actions
```

Esperado: PASS (7 testes).

- [ ] **Step 6: Commitar**

```bash
git add lib/types/database.ts actions/produto-actions.ts tests/produto-actions.test.ts
git commit -m "feat: add produto types and Server Actions with unique codigo handling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Listagem de produtos com busca e ativar/inativar

**Files:**
- Create: `components/produtos/produtos-table.tsx`, `components/produtos/produtos-page-client.tsx`
- Modify: `app/(app)/produtos/page.tsx` (substitui o placeholder "em construção")

**Interfaces:**
- Consumes: `requireModuleAccess('produtos')` (Fundação), `listProdutos`/`toggleProdutoAtivo` (Task 2), `buttonVariants` de `components/ui/button.tsx`.

- [ ] **Step 1: Criar `ProdutosTable`**

Crie `components/produtos/produtos-table.tsx`:

```tsx
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Produto } from '@/lib/types/database'

export function ProdutosTable({
  produtos,
  onToggleAtivo,
}: {
  produtos: Produto[]
  onToggleAtivo: (id: string, ativo: boolean) => void
}) {
  if (produtos.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Nenhum produto cadastrado ainda.
      </p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Código</th>
          <th className="py-2">Nome</th>
          <th className="py-2">Unidade</th>
          <th className="py-2">Categoria</th>
          <th className="py-2">Status</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {produtos.map((produto) => (
          <tr key={produto.id} className="border-b">
            <td className="py-2">{produto.codigo}</td>
            <td className="py-2">{produto.nome}</td>
            <td className="py-2">{produto.unidade}</td>
            <td className="py-2">{produto.categoria ?? '—'}</td>
            <td className="py-2">
              <span
                className={
                  produto.ativo
                    ? 'text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 text-xs'
                    : 'text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 text-xs'
                }
              >
                {produto.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            <td className="py-2 text-right space-x-2">
              <Link href={`/produtos/${produto.id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Editar
              </Link>
              <Button variant="ghost" size="sm" onClick={() => onToggleAtivo(produto.id, !produto.ativo)}>
                {produto.ativo ? 'Inativar' : 'Reativar'}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Criar o wrapper client com busca**

Crie `components/produtos/produtos-page-client.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProdutosTable } from './produtos-table'
import { listProdutos, toggleProdutoAtivo } from '@/actions/produto-actions'
import type { Produto } from '@/lib/types/database'

export function ProdutosPageClient({ produtosIniciais }: { produtosIniciais: Produto[] }) {
  const [produtos, setProdutos] = useState(produtosIniciais)
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBuscar(formData: FormData) {
    const query = (formData.get('busca') as string) ?? ''
    setBusca(query)
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await listProdutos(query || undefined)
        setProdutos(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar produtos.')
      }
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        await toggleProdutoAtivo(id, ativo)
        const resultado = await listProdutos(busca || undefined)
        setProdutos(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao atualizar produto.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Produtos</h1>
        <Link href="/produtos/novo" className={buttonVariants({ variant: 'default' })}>
          Novo produto
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={handleBuscar} className="flex gap-2 max-w-sm">
        <Input name="busca" placeholder="Buscar por nome ou código" defaultValue={busca} />
        <Button type="submit" variant="outline" disabled={isPending}>
          Buscar
        </Button>
      </form>
      <ProdutosTable produtos={produtos} onToggleAtivo={handleToggleAtivo} />
    </div>
  )
}
```

- [ ] **Step 3: Substituir a página placeholder**

Substitua `app/(app)/produtos/page.tsx` por:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listProdutos } from '@/actions/produto-actions'
import { ProdutosPageClient } from '@/components/produtos/produtos-page-client'

export default async function ProdutosPage() {
  await requireModuleAccess('produtos')
  const produtos = await listProdutos()

  return <ProdutosPageClient produtosIniciais={produtos} />
}
```

- [ ] **Step 4: Verificar tipos e build**

```bash
npx tsc --noEmit
npm run build
```

Esperado: ambos sem erro.

- [ ] **Step 5: Testar manualmente**

```bash
npm run dev
```

Acesse `/produtos` logado como Admin — confirme que a página mostra "Nenhum produto cadastrado ainda." (lista vazia nesta fase).

- [ ] **Step 6: Commitar**

```bash
git add "app/(app)/produtos/page.tsx" components/produtos/produtos-table.tsx components/produtos/produtos-page-client.tsx
git commit -m "feat: add produtos listing page with search and ativar/inativar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Formulário de criar/editar produto

**Files:**
- Create: `components/produtos/produto-form.tsx`, `app/(app)/produtos/novo/page.tsx`, `app/(app)/produtos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `createProduto`/`updateProduto`/`getProduto` (Task 2), `requireModuleAccess` (Fundação).

- [ ] **Step 1: Criar o formulário compartilhado**

Crie `components/produtos/produto-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProduto, updateProduto } from '@/actions/produto-actions'
import type { Produto, ProdutoInput } from '@/lib/types/database'

export function ProdutoForm({ produto }: { produto?: Produto }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEditing = Boolean(produto)

  function handleSubmit(formData: FormData) {
    setError(null)

    const input: ProdutoInput = {
      codigo: formData.get('codigo') as string,
      codigo_barras: (formData.get('codigo_barras') as string) || null,
      nome: formData.get('nome') as string,
      unidade: formData.get('unidade') as string,
      categoria: (formData.get('categoria') as string) || null,
    }

    startTransition(async () => {
      try {
        if (isEditing && produto) {
          await updateProduto(produto.id, input)
        } else {
          await createProduto(input)
        }
        router.push('/produtos')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar produto.')
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="codigo">Código</Label>
          <Input id="codigo" name="codigo" defaultValue={produto?.codigo} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="codigo_barras">Código de barras</Label>
          <Input id="codigo_barras" name="codigo_barras" defaultValue={produto?.codigo_barras ?? ''} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" defaultValue={produto?.nome} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unidade">Unidade</Label>
          <Input id="unidade" name="unidade" placeholder="un, kg, cx..." defaultValue={produto?.unidade} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="categoria">Categoria</Label>
          <Input id="categoria" name="categoria" defaultValue={produto?.categoria ?? ''} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/produtos')}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Criar a página de novo produto**

Crie `app/(app)/produtos/novo/page.tsx`:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ProdutoForm } from '@/components/produtos/produto-form'

export default async function NovoProdutoPage() {
  await requireModuleAccess('produtos')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Novo produto</h1>
      <ProdutoForm />
    </div>
  )
}
```

- [ ] **Step 3: Criar a página de editar produto**

Crie `app/(app)/produtos/[id]/editar/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getProduto } from '@/actions/produto-actions'
import { ProdutoForm } from '@/components/produtos/produto-form'

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModuleAccess('produtos')
  const { id } = await params
  const produto = await getProduto(id)

  if (!produto) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Editar produto</h1>
      <ProdutoForm produto={produto} />
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos, build e suite completa**

```bash
npx tsc --noEmit
npm run build
npm test
```

Esperado: `tsc`/`build` sem erro; `npm test` com todos os testes verdes exceto os já conhecidos como rate-limited em `tests/user-actions.test.ts` (limitação externa da API de Auth do Supabase, não relacionada a este módulo).

- [ ] **Step 5: Testar manualmente o fluxo completo**

```bash
npm run dev
```

Logado como Admin:
1. Em `/produtos`, clique "Novo produto". Cadastre um produto com código `TESTE-0001`, nome, unidade `un` — confirme redirecionamento para `/produtos` e o produto aparecendo na lista.
2. Cadastre um segundo produto com código de barras preenchido e categoria preenchida — confirme que aparecem corretamente na listagem.
3. Tente cadastrar outro produto com o mesmo código `TESTE-0001` — confirme a mensagem "Já existe um produto cadastrado com esse código." sem sair da tela.
4. Busque por parte do nome de um dos produtos criados — confirme que a lista filtra corretamente. Busque pelo código — confirme que também filtra.
5. Edite um dos produtos (mude o nome e o código) — confirme que a alteração aparece na lista.
6. Clique "Inativar" em um produto — confirme que o status muda para "Inativo". Clique "Reativar" — confirme volta para "Ativo".
7. Apague os produtos de teste diretamente no Supabase Cloud (SQL Editor: `delete from produtos where codigo in ('TESTE-0001', 'TESTE-0002');` — ajuste conforme os códigos usados) para não deixar dados de teste em produção.

- [ ] **Step 6: Commitar**

```bash
git add "app/(app)/produtos/novo" "app/(app)/produtos/[id]" components/produtos/produto-form.tsx
git commit -m "feat: add produto create/edit form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
