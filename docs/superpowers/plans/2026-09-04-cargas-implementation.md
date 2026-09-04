# Cadastro de Cargas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder "em construção" de `/cargas` por um CRUD completo de cargas (fornecedor, nome, data, itens adicionados manualmente via modal com produto/quantidade/valor de compra), com salvamento atômico via função no banco, listagem com total calculado, busca e inativação.

**Architecture:** Duas tabelas novas (`cargas`, `itens_carga`) no mesmo projeto Supabase Cloud, protegidas por RLS reaproveitando `has_module_access('cargas')`. Duas funções PL/pgSQL (`criar_carga_com_itens`, `atualizar_carga_com_itens`) garantem que carga+itens sejam gravados atomicamente numa única transação, chamadas via `.rpc()` a partir de `actions/carga-actions.ts`. UI em páginas dedicadas: listagem, e um formulário compartilhado entre criar/editar que monta a lista de itens inteiramente no client (nada é gravado até "Salvar carga") usando um novo componente `Dialog` reaproveitável (`components/ui/dialog.tsx`, primeiro modal de verdade do projeto, construído sobre `@base-ui/react/dialog`).

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 (strict), Tailwind CSS + shadcn/ui (`@base-ui/react`), Supabase (Postgres, Auth, RLS, funções PL/pgSQL — projeto Cloud existente), Vitest, Vercel.

**Spec:** [docs/superpowers/specs/2026-09-04-cargas-design.md](../specs/2026-09-04-cargas-design.md)

## Global Constraints

- Segue a stack e convenções já estabelecidas: Next.js App Router, TypeScript `strict`, Tailwind + shadcn/ui (nenhuma outra lib de UI), Supabase com RLS, Vitest, npm.
- Toda tabela nova precisa de Row Level Security habilitada — nunca deixar tabela sem policy.
- `cargas` não tem policy de `delete` (mesmo padrão dos módulos anteriores — inativação via `ativo=false`). `itens_carga` **tem** policy de `delete`, porque `atualizar_carga_com_itens` de fato apaga e reinsere os itens a cada edição — isso é uma exceção deliberada ao padrão "sem delete" dos módulos anteriores, não um erro.
- `criar_carga_com_itens`/`atualizar_carga_com_itens` são o único caminho de escrita de carga+itens juntos — nunca inserir em `cargas` e `itens_carga` como duas chamadas Supabase separadas a partir do Node (isso reabriria a janela de risco de carga órfã que as funções existem para eliminar).
- Toda Server Action exportada em `carga-actions.ts` chama `await assertModuleAccess('cargas')` como primeira linha.
- `listCargas` filtra por nome da carga OU nome do fornecedor em memória (no Node), depois de buscar as cargas com o fornecedor já embutido (`select` com `fornecedores(nome)`) — **não** usa `quotePostgrestValue`/`.or()` como os módulos anteriores, porque o PostgREST não tem um jeito confiável de filtrar por coluna de uma tabela embutida (join) dentro de um único `.or()`. Essa é uma divergência deliberada do padrão de busca de Clientes/Fornecedores/Produtos, justificada pela necessidade de buscar por uma coluna de outra tabela.
- Subtotal de item e total da carga nunca são armazenados no banco — sempre calculados na hora, no Node (`quantidade * valor_unitario`, somado).
- **Gotcha conhecido deste projeto:** o `Button` de `components/ui/button.tsx` embrulha `@base-ui/react`, não Radix, e **não tem prop `asChild`**. Para um link estilizado como botão, usar `buttonVariants({ variant, size })` aplicado à `className` de um `<Link>` normal.
- `SUPABASE_SERVICE_ROLE_KEY` só em código server-only (`'use server'` ou `lib/supabase/admin.ts`), nunca em Client Components.
- Toda tela sob `/cargas` protegida por `requireModuleAccess('cargas')` (redireciona para `/acesso-negado`), mesmo padrão dos módulos anteriores.
- Este plano cobre só o cadastro manual de cargas — importação de XML/NF-e é um sub-projeto futuro, fora de escopo aqui.

---

### Task 1: Migração do banco — tabelas `cargas`/`itens_carga`, RLS e funções de escrita atômica

**Files:**
- Create: `supabase/migrations/0005_cargas.sql`

**Interfaces:**
- Consumes: função `has_module_access(module text) returns boolean` (`0001_fundacao.sql`); tabelas `fornecedores` (`0003_fornecedores.sql`) e `produtos` (`0004_produtos.sql`).
- Produces: tabelas `cargas` e `itens_carga` com RLS habilitada; funções `criar_carga_com_itens(p_fornecedor_id uuid, p_nome text, p_data date, p_itens jsonb) returns uuid` e `atualizar_carga_com_itens(p_carga_id uuid, p_fornecedor_id uuid, p_nome text, p_data date, p_itens jsonb) returns void`.

- [ ] **Step 1: Escrever a migração**

Crie `supabase/migrations/0005_cargas.sql`:

```sql
create table cargas (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id),
  nome text not null,
  data date not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table itens_carga (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade numeric not null check (quantidade > 0),
  valor_unitario numeric not null check (valor_unitario >= 0),
  created_at timestamptz not null default now(),
  unique (carga_id, produto_id)
);

alter table cargas enable row level security;
alter table itens_carga enable row level security;

create policy "cargas_select_com_acesso"
  on cargas for select using (has_module_access('cargas'));

create policy "cargas_insert_com_acesso"
  on cargas for insert with check (has_module_access('cargas'));

create policy "cargas_update_com_acesso"
  on cargas for update using (has_module_access('cargas'));

create policy "itens_carga_select_com_acesso"
  on itens_carga for select using (has_module_access('cargas'));

create policy "itens_carga_insert_com_acesso"
  on itens_carga for insert with check (has_module_access('cargas'));

create policy "itens_carga_delete_com_acesso"
  on itens_carga for delete using (has_module_access('cargas'));

create or replace function criar_carga_com_itens(
  p_fornecedor_id uuid,
  p_nome text,
  p_data date,
  p_itens jsonb
) returns uuid
language plpgsql
as $$
declare
  v_carga_id uuid;
begin
  insert into cargas (fornecedor_id, nome, data)
  values (p_fornecedor_id, p_nome, p_data)
  returning id into v_carga_id;

  insert into itens_carga (carga_id, produto_id, quantidade, valor_unitario)
  select v_carga_id,
         (item->>'produto_id')::uuid,
         (item->>'quantidade')::numeric,
         (item->>'valor_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  return v_carga_id;
end;
$$;

create or replace function atualizar_carga_com_itens(
  p_carga_id uuid,
  p_fornecedor_id uuid,
  p_nome text,
  p_data date,
  p_itens jsonb
) returns void
language plpgsql
as $$
begin
  update cargas
  set fornecedor_id = p_fornecedor_id, nome = p_nome, data = p_data
  where id = p_carga_id;

  delete from itens_carga where carga_id = p_carga_id;

  insert into itens_carga (carga_id, produto_id, quantidade, valor_unitario)
  select p_carga_id,
         (item->>'produto_id')::uuid,
         (item->>'quantidade')::numeric,
         (item->>'valor_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;
end;
$$;
```

- [ ] **Step 2: Aplicar a migração no projeto Supabase Cloud**

Abra o SQL Editor do projeto Supabase Cloud (Project Settings → SQL Editor) e execute o conteúdo de `supabase/migrations/0005_cargas.sql`.

- [ ] **Step 3: Verificar que as tabelas foram criadas com RLS ativa**

```bash
set -a; source .env.local; set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cargas?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/itens_carga?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Esperado: `[]` nas duas chamadas. As funções `criar_carga_com_itens`/`atualizar_carga_com_itens` não são verificadas aqui (não dá pra chamá-las via curl sem criar dados reais) — a verificação real delas acontece nos testes de integração da Task 3.

- [ ] **Step 4: Commitar**

```bash
git add supabase/migrations/0005_cargas.sql
git commit -m "feat: add cargas/itens_carga tables with RLS and atomic write functions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Componente `Dialog` reaproveitável

**Files:**
- Create: `components/ui/dialog.tsx`

**Interfaces:**
- Consumes: `Dialog` de `@base-ui/react/dialog` (já é dependência do projeto), `cn` de `lib/utils.ts`.
- Produces: `Dialog` (= `DialogPrimitive.Root`, controlado via props `open`/`onOpenChange`), `DialogContent`, `DialogTitle` — exportados de `components/ui/dialog.tsx`, para uso em qualquer módulo futuro que precise de um modal.

- [ ] **Step 1: Criar `components/ui/dialog.tsx`**

```tsx
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogClose = DialogPrimitive.Close

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-slate-950/50 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-lg outline-none data-[ending-style]:opacity-0 data-[ending-style]:scale-95 data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
          className
        )}
        {...props}
      >
        {children}
        <DialogClose className="absolute top-4 right-4 rounded-md text-slate-400 outline-none hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-400">
          <X className="size-4" />
          <span className="sr-only">Fechar</span>
        </DialogClose>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base font-semibold text-slate-900', className)}
      {...props}
    />
  )
}

export { Dialog, DialogClose, DialogContent, DialogTitle }
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: sem erro.

- [ ] **Step 3: Commitar**

```bash
git add components/ui/dialog.tsx
git commit -m "feat: add reusable Dialog component wrapping @base-ui/react

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Tipos e Server Actions de cargas

**Files:**
- Modify: `lib/types/database.ts`
- Create: `actions/carga-actions.ts`
- Test: `tests/carga-actions.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()` (`lib/supabase/admin.ts`), `assertModuleAccess` (`lib/auth/assert-module-access.ts`), `getCurrentProfile` (`lib/auth/get-current-profile.ts`, para mock em teste), funções `criar_carga_com_itens`/`atualizar_carga_com_itens` (Task 1).
- Produces:
  - Tipos `CargaResumo`, `ItemCarga`, `CargaComItens`, `CargaInput` em `lib/types/database.ts`.
  - `listCargas(query?: string): Promise<CargaResumo[]>`
  - `getCarga(id: string): Promise<CargaComItens | null>`
  - `createCarga(input: CargaInput): Promise<{ id: string }>`
  - `updateCarga(id: string, input: CargaInput): Promise<void>`
  - `toggleCargaAtivo(id: string, ativo: boolean): Promise<void>`
  - `listFornecedoresAtivos(): Promise<{ id: string; nome: string }[]>`
  - `listProdutosAtivos(): Promise<{ id: string; codigo: string; nome: string; unidade: string }[]>`
  - todas em `actions/carga-actions.ts`.

- [ ] **Step 1: Adicionar os tipos em `lib/types/database.ts`**

Adicione ao final do arquivo:

```ts
export interface CargaResumo {
  id: string
  nome: string
  data: string
  ativo: boolean
  fornecedor_nome: string
  total: number
}

export interface ItemCarga {
  id: string
  produto_id: string
  produto_codigo: string
  produto_nome: string
  produto_unidade: string
  quantidade: number
  valor_unitario: number
}

export interface CargaComItens {
  id: string
  fornecedor_id: string
  fornecedor_nome: string
  nome: string
  data: string
  ativo: boolean
  itens: ItemCarga[]
}

export interface CargaInput {
  fornecedor_id: string
  nome: string
  data: string
  itens: { produto_id: string; quantidade: number; valor_unitario: number }[]
}
```

- [ ] **Step 2: Escrever o teste de integração das Server Actions (falhando)**

Crie `tests/carga-actions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createCarga,
  updateCarga,
  listCargas,
  getCarga,
  toggleCargaAtivo,
} from '@/actions/carga-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { CargaInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const DOCUMENTO_FORNECEDOR_TESTE = '11144477735'
const CODIGO_PRODUTO_A = 'TESTE-CARGA-A'
const CODIGO_PRODUTO_B = 'TESTE-CARGA-B'

let fornecedorId: string
let produtoAId: string
let produtoBId: string

describe('carga-actions', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()

    const { data: fornecedor, error: fornecedorError } = await supabase
      .from('fornecedores')
      .insert({ tipo: 'pf', documento: DOCUMENTO_FORNECEDOR_TESTE, nome: 'Fornecedor Teste Carga' })
      .select()
      .single()
    if (fornecedorError) throw fornecedorError
    fornecedorId = fornecedor.id

    const { data: produtoA, error: produtoAError } = await supabase
      .from('produtos')
      .insert({ codigo: CODIGO_PRODUTO_A, nome: 'Produto Teste Carga A', unidade: 'un' })
      .select()
      .single()
    if (produtoAError) throw produtoAError
    produtoAId = produtoA.id

    const { data: produtoB, error: produtoBError } = await supabase
      .from('produtos')
      .insert({ codigo: CODIGO_PRODUTO_B, nome: 'Produto Teste Carga B', unidade: 'kg' })
      .select()
      .single()
    if (produtoBError) throw produtoBError
    produtoBId = produtoB.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('id', fornecedorId)
    await supabase.from('produtos').delete().in('id', [produtoAId, produtoBId])
  })

  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('cargas').delete().eq('fornecedor_id', fornecedorId)
  })

  it('cria uma carga com múltiplos itens atomicamente', async () => {
    const input: CargaInput = {
      fornecedor_id: fornecedorId,
      nome: 'Carga Teste',
      data: '2026-09-04',
      itens: [
        { produto_id: produtoAId, quantidade: 10, valor_unitario: 2.5 },
        { produto_id: produtoBId, quantidade: 3.5, valor_unitario: 8 },
      ],
    }

    const { id } = await createCarga(input)
    const carga = await getCarga(id)

    expect(carga?.nome).toBe('Carga Teste')
    expect(carga?.itens).toHaveLength(2)
  })

  it('rejeita salvar carga sem nenhum item', async () => {
    await expect(
      createCarga({ fornecedor_id: fornecedorId, nome: 'Carga Vazia', data: '2026-09-04', itens: [] })
    ).rejects.toThrow('A carga precisa ter pelo menos um produto.')
  })

  it('não deixa carga órfã se a inserção dos itens falhar', async () => {
    const input: CargaInput = {
      fornecedor_id: fornecedorId,
      nome: 'Carga Com Item Inválido',
      data: '2026-09-04',
      itens: [
        { produto_id: produtoAId, quantidade: 10, valor_unitario: 2.5 },
        { produto_id: produtoAId, quantidade: 5, valor_unitario: 3 },
      ],
    }

    await expect(createCarga(input)).rejects.toThrow()

    const cargas = await listCargas('Carga Com Item Inválido')
    expect(cargas).toHaveLength(0)
  })

  it('atualiza uma carga substituindo a lista de itens', async () => {
    const { id } = await createCarga({
      fornecedor_id: fornecedorId,
      nome: 'Carga Original',
      data: '2026-09-04',
      itens: [{ produto_id: produtoAId, quantidade: 5, valor_unitario: 1 }],
    })

    await updateCarga(id, {
      fornecedor_id: fornecedorId,
      nome: 'Carga Atualizada',
      data: '2026-09-05',
      itens: [{ produto_id: produtoBId, quantidade: 7, valor_unitario: 2 }],
    })

    const carga = await getCarga(id)
    expect(carga?.nome).toBe('Carga Atualizada')
    expect(carga?.itens).toHaveLength(1)
    expect(carga?.itens[0].produto_id).toBe(produtoBId)
  })

  it('lista cargas com o total calculado', async () => {
    await createCarga({
      fornecedor_id: fornecedorId,
      nome: 'Carga Para Total',
      data: '2026-09-04',
      itens: [{ produto_id: produtoAId, quantidade: 4, valor_unitario: 2.5 }],
    })

    const cargas = await listCargas('Carga Para Total')
    expect(cargas).toHaveLength(1)
    expect(cargas[0].total).toBe(10)
  })

  it('busca cargas pelo nome do fornecedor', async () => {
    await createCarga({
      fornecedor_id: fornecedorId,
      nome: 'Carga Qualquer',
      data: '2026-09-04',
      itens: [{ produto_id: produtoAId, quantidade: 1, valor_unitario: 1 }],
    })

    const resultados = await listCargas('Fornecedor Teste Carga')
    expect(resultados.some((c) => c.nome === 'Carga Qualquer')).toBe(true)
  })

  it('inativa e reativa uma carga', async () => {
    const { id } = await createCarga({
      fornecedor_id: fornecedorId,
      nome: 'Carga Toggle',
      data: '2026-09-04',
      itens: [{ produto_id: produtoAId, quantidade: 1, valor_unitario: 1 }],
    })

    await toggleCargaAtivo(id, false)
    let carga = await getCarga(id)
    expect(carga?.ativo).toBe(false)

    await toggleCargaAtivo(id, true)
    carga = await getCarga(id)
    expect(carga?.ativo).toBe(true)
  })

  it('rejeita chamadas de um usuário sem permissão de cargas', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listCargas()).rejects.toThrow('Acesso negado.')
  })
})
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

```bash
npm test -- carga-actions
```

Esperado: FAIL — `Cannot find module '@/actions/carga-actions'`.

- [ ] **Step 4: Implementar `actions/carga-actions.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { CargaComItens, CargaInput, CargaResumo } from '@/lib/types/database'

export async function listCargas(query?: string): Promise<CargaResumo[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cargas')
    .select('id, nome, data, ativo, fornecedores(nome), itens_carga(quantidade, valor_unitario)')
    .order('data', { ascending: false })

  if (error) throw new Error(error.message)

  const cargas: CargaResumo[] = (data ?? []).map((c) => {
    const fornecedor = c.fornecedores as unknown as { nome: string } | null
    const itens = (c.itens_carga ?? []) as unknown as { quantidade: number; valor_unitario: number }[]
    return {
      id: c.id,
      nome: c.nome,
      data: c.data,
      ativo: c.ativo,
      fornecedor_nome: fornecedor?.nome ?? '',
      total: itens.reduce((soma, item) => soma + item.quantidade * item.valor_unitario, 0),
    }
  })

  if (!query) return cargas

  const termo = query.toLowerCase()
  return cargas.filter(
    (c) => c.nome.toLowerCase().includes(termo) || c.fornecedor_nome.toLowerCase().includes(termo)
  )
}

export async function getCarga(id: string): Promise<CargaComItens | null> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()

  const { data: carga } = await supabase
    .from('cargas')
    .select('id, fornecedor_id, nome, data, ativo, fornecedores(nome)')
    .eq('id', id)
    .single()

  if (!carga) return null

  const { data: itens, error } = await supabase
    .from('itens_carga')
    .select('id, produto_id, quantidade, valor_unitario, produtos(codigo, nome, unidade)')
    .eq('carga_id', id)

  if (error) throw new Error(error.message)

  const fornecedor = carga.fornecedores as unknown as { nome: string } | null

  return {
    id: carga.id,
    fornecedor_id: carga.fornecedor_id,
    fornecedor_nome: fornecedor?.nome ?? '',
    nome: carga.nome,
    data: carga.data,
    ativo: carga.ativo,
    itens: (itens ?? []).map((item) => {
      const produto = item.produtos as unknown as { codigo: string; nome: string; unidade: string }
      return {
        id: item.id,
        produto_id: item.produto_id,
        produto_codigo: produto.codigo,
        produto_nome: produto.nome,
        produto_unidade: produto.unidade,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
      }
    }),
  }
}

export async function createCarga(input: CargaInput): Promise<{ id: string }> {
  await assertModuleAccess('cargas')

  if (input.itens.length === 0) {
    throw new Error('A carga precisa ter pelo menos um produto.')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('criar_carga_com_itens', {
    p_fornecedor_id: input.fornecedor_id,
    p_nome: input.nome,
    p_data: input.data,
    p_itens: input.itens,
  })

  if (error) {
    if (error.code === '23505') {
      throw new Error('Não é possível adicionar o mesmo produto duas vezes na carga.')
    }
    throw new Error(error.message)
  }

  return { id: data as string }
}

export async function updateCarga(id: string, input: CargaInput): Promise<void> {
  await assertModuleAccess('cargas')

  if (input.itens.length === 0) {
    throw new Error('A carga precisa ter pelo menos um produto.')
  }

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('atualizar_carga_com_itens', {
    p_carga_id: id,
    p_fornecedor_id: input.fornecedor_id,
    p_nome: input.nome,
    p_data: input.data,
    p_itens: input.itens,
  })

  if (error) {
    if (error.code === '23505') {
      throw new Error('Não é possível adicionar o mesmo produto duas vezes na carga.')
    }
    throw new Error(error.message)
  }
}

export async function toggleCargaAtivo(id: string, ativo: boolean): Promise<void> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { error } = await supabase.from('cargas').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listFornecedoresAtivos(): Promise<{ id: string; nome: string }[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listProdutosAtivos(): Promise<{ id: string; codigo: string; nome: string; unidade: string }[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('produtos')
    .select('id, codigo, nome, unidade')
    .eq('ativo', true)
    .order('nome')
  if (error) throw new Error(error.message)
  return data ?? []
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

```bash
npm test -- carga-actions
```

Esperado: PASS (8 testes).

- [ ] **Step 6: Commitar**

```bash
git add lib/types/database.ts actions/carga-actions.ts tests/carga-actions.test.ts
git commit -m "feat: add carga types and Server Actions with atomic RPC-backed writes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Listagem de cargas com busca e ativar/inativar

**Files:**
- Create: `components/cargas/cargas-table.tsx`, `components/cargas/cargas-page-client.tsx`
- Modify: `app/(app)/cargas/page.tsx` (substitui o placeholder "em construção")

**Interfaces:**
- Consumes: `requireModuleAccess('cargas')` (Fundação), `listCargas`/`toggleCargaAtivo` (Task 3), `buttonVariants` de `components/ui/button.tsx`.

- [ ] **Step 1: Criar `CargasTable`**

Crie `components/cargas/cargas-table.tsx`:

```tsx
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import type { CargaResumo } from '@/lib/types/database'

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
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
          <th className="py-2">Status</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {cargas.map((carga) => (
          <tr key={carga.id} className="border-b">
            <td className="py-2">{carga.nome}</td>
            <td className="py-2">{carga.fornecedor_nome}</td>
            <td className="py-2">{formatarData(carga.data)}</td>
            <td className="py-2">{formatarMoeda(carga.total)}</td>
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

- [ ] **Step 2: Criar o wrapper client com busca**

Crie `components/cargas/cargas-page-client.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CargasTable } from './cargas-table'
import { listCargas, toggleCargaAtivo } from '@/actions/carga-actions'
import type { CargaResumo } from '@/lib/types/database'

export function CargasPageClient({ cargasIniciais }: { cargasIniciais: CargaResumo[] }) {
  const [cargas, setCargas] = useState(cargasIniciais)
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBuscar(formData: FormData) {
    const query = (formData.get('busca') as string) ?? ''
    setBusca(query)
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await listCargas(query || undefined)
        setCargas(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar cargas.')
      }
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        await toggleCargaAtivo(id, ativo)
        const resultado = await listCargas(busca || undefined)
        setCargas(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao atualizar carga.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Cargas</h1>
        <Link href="/cargas/novo" className={buttonVariants({ variant: 'default' })}>
          Nova carga
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={handleBuscar} className="flex gap-2 max-w-sm">
        <Input name="busca" placeholder="Buscar por nome ou fornecedor" defaultValue={busca} />
        <Button type="submit" variant="outline" disabled={isPending}>
          Buscar
        </Button>
      </form>
      <CargasTable cargas={cargas} onToggleAtivo={handleToggleAtivo} />
    </div>
  )
}
```

- [ ] **Step 3: Substituir a página placeholder**

Substitua `app/(app)/cargas/page.tsx` por:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listCargas } from '@/actions/carga-actions'
import { CargasPageClient } from '@/components/cargas/cargas-page-client'

export default async function CargasPage() {
  await requireModuleAccess('cargas')
  const cargas = await listCargas()

  return <CargasPageClient cargasIniciais={cargas} />
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

Acesse `/cargas` logado como Admin — confirme que a página mostra "Nenhuma carga cadastrada ainda." (lista vazia nesta fase).

- [ ] **Step 6: Commitar**

```bash
git add "app/(app)/cargas/page.tsx" components/cargas/cargas-table.tsx components/cargas/cargas-page-client.tsx
git commit -m "feat: add cargas listing page with search and ativar/inativar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Formulário de criar/editar carga com modal de adicionar produto

**Files:**
- Create: `components/cargas/adicionar-produto-modal.tsx`, `components/cargas/carga-form.tsx`, `app/(app)/cargas/novo/page.tsx`, `app/(app)/cargas/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `createCarga`/`updateCarga`/`getCarga`/`listFornecedoresAtivos`/`listProdutosAtivos` (Task 3), `requireModuleAccess` (Fundação), `Dialog`/`DialogContent`/`DialogTitle` (Task 2).

- [ ] **Step 1: Criar o modal de adicionar produto**

Crie `components/cargas/adicionar-produto-modal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ProdutoDisponivel {
  id: string
  codigo: string
  nome: string
  unidade: string
}

export interface ItemCargaLocal {
  produto_id: string
  produto_codigo: string
  produto_nome: string
  produto_unidade: string
  quantidade: number
  valor_unitario: number
}

export function AdicionarProdutoModal({
  open,
  onOpenChange,
  produtosDisponiveis,
  onAdicionar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  produtosDisponiveis: ProdutoDisponivel[]
  onAdicionar: (item: ItemCargaLocal) => void
}) {
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [valorUnitario, setValorUnitario] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleAdicionar() {
    setError(null)
    const produto = produtosDisponiveis.find((p) => p.id === produtoId)
    const quantidadeNum = Number(quantidade)
    const valorNum = Number(valorUnitario)

    if (!produto) {
      setError('Selecione um produto.')
      return
    }
    if (!(quantidadeNum > 0)) {
      setError('Quantidade precisa ser maior que zero.')
      return
    }
    if (!(valorNum >= 0)) {
      setError('Valor unitário inválido.')
      return
    }

    onAdicionar({
      produto_id: produto.id,
      produto_codigo: produto.codigo,
      produto_nome: produto.nome,
      produto_unidade: produto.unidade,
      quantidade: quantidadeNum,
      valor_unitario: valorNum,
    })

    setProdutoId('')
    setQuantidade('')
    setValorUnitario('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Adicionar produto</DialogTitle>
        <div className="space-y-4 mt-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="produto_id">Produto</Label>
            <select
              id="produto_id"
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
              className="h-9 rounded-md border border-slate-200 px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {produtosDisponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantidade">Quantidade</Label>
              <Input
                id="quantidade"
                type="number"
                step="any"
                min="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor_unitario">Valor unitário (R$)</Label>
              <Input
                id="valor_unitario"
                type="number"
                step="any"
                min="0"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAdicionar}>
              Adicionar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Criar o formulário compartilhado**

Crie `components/cargas/carga-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCarga, updateCarga } from '@/actions/carga-actions'
import { AdicionarProdutoModal, type ItemCargaLocal, type ProdutoDisponivel } from './adicionar-produto-modal'
import type { CargaComItens, CargaInput } from '@/lib/types/database'

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CargaForm({
  carga,
  fornecedores,
  produtosDisponiveis,
}: {
  carga?: CargaComItens
  fornecedores: { id: string; nome: string }[]
  produtosDisponiveis: ProdutoDisponivel[]
}) {
  const router = useRouter()
  const isEditing = Boolean(carga)

  const fornecedoresParaSelecao =
    carga && !fornecedores.some((f) => f.id === carga.fornecedor_id)
      ? [{ id: carga.fornecedor_id, nome: carga.fornecedor_nome }, ...fornecedores]
      : fornecedores

  const [fornecedorId, setFornecedorId] = useState(carga?.fornecedor_id ?? '')
  const [itens, setItens] = useState<ItemCargaLocal[]>(
    carga?.itens.map((item) => ({
      produto_id: item.produto_id,
      produto_codigo: item.produto_codigo,
      produto_nome: item.produto_nome,
      produto_unidade: item.produto_unidade,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
    })) ?? []
  )
  const [modalAberto, setModalAberto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const produtosParaModal = produtosDisponiveis.filter(
    (p) => !itens.some((item) => item.produto_id === p.id)
  )

  const total = itens.reduce((soma, item) => soma + item.quantidade * item.valor_unitario, 0)

  function handleAdicionarItem(item: ItemCargaLocal) {
    setItens((atual) => [...atual, item])
  }

  function handleRemoverItem(produtoId: string) {
    setItens((atual) => atual.filter((item) => item.produto_id !== produtoId))
  }

  function handleSubmit(formData: FormData) {
    setError(null)

    if (itens.length === 0) {
      setError('Adicione pelo menos um produto à carga.')
      return
    }

    const input: CargaInput = {
      fornecedor_id: formData.get('fornecedor_id') as string,
      nome: formData.get('nome') as string,
      data: formData.get('data') as string,
      itens: itens.map(({ produto_id, quantidade, valor_unitario }) => ({
        produto_id,
        quantidade,
        valor_unitario,
      })),
    }

    startTransition(async () => {
      try {
        if (isEditing && carga) {
          await updateCarga(carga.id, input)
        } else {
          await createCarga(input)
        }
        router.push('/cargas')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar carga.')
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-3xl">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fornecedor_id">Fornecedor</Label>
          <select
            id="fornecedor_id"
            name="fornecedor_id"
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
            required
            className="h-9 rounded-md border border-slate-200 px-3 text-sm"
          >
            <option value="">Selecione...</option>
            {fornecedoresParaSelecao.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" defaultValue={carga?.data} required />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome da carga</Label>
        <Input id="nome" name="nome" defaultValue={carga?.nome} required />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Produtos</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setModalAberto(true)}>
            Adicionar produto
          </Button>
        </div>

        {itens.length === 0 ? (
          <p className="text-sm text-slate-500 border border-dashed rounded-lg p-6 text-center">
            Nenhum produto adicionado ainda.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Produto</th>
                <th className="py-2">Qtd.</th>
                <th className="py-2">Valor unit.</th>
                <th className="py-2">Subtotal</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.produto_id} className="border-b">
                  <td className="py-2">
                    {item.produto_codigo} — {item.produto_nome}
                  </td>
                  <td className="py-2">
                    {item.quantidade} {item.produto_unidade}
                  </td>
                  <td className="py-2">{formatarMoeda(item.valor_unitario)}</td>
                  <td className="py-2">{formatarMoeda(item.quantidade * item.valor_unitario)}</td>
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoverItem(item.produto_id)}
                    >
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="text-right text-sm font-medium">Total: {formatarMoeda(total)}</p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || itens.length === 0}>
          {isPending ? 'Salvando...' : 'Salvar carga'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/cargas')}>
          Cancelar
        </Button>
      </div>

      <AdicionarProdutoModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        produtosDisponiveis={produtosParaModal}
        onAdicionar={handleAdicionarItem}
      />
    </form>
  )
}
```

- [ ] **Step 3: Criar a página de nova carga**

Crie `app/(app)/cargas/novo/page.tsx`:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listFornecedoresAtivos, listProdutosAtivos } from '@/actions/carga-actions'
import { CargaForm } from '@/components/cargas/carga-form'

export default async function NovaCargaPage() {
  await requireModuleAccess('cargas')
  const [fornecedores, produtos] = await Promise.all([listFornecedoresAtivos(), listProdutosAtivos()])

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Nova carga</h1>
      <CargaForm fornecedores={fornecedores} produtosDisponiveis={produtos} />
    </div>
  )
}
```

- [ ] **Step 4: Criar a página de editar carga**

Crie `app/(app)/cargas/[id]/editar/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getCarga, listFornecedoresAtivos, listProdutosAtivos } from '@/actions/carga-actions'
import { CargaForm } from '@/components/cargas/carga-form'

export default async function EditarCargaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModuleAccess('cargas')
  const { id } = await params
  const [carga, fornecedores, produtos] = await Promise.all([
    getCarga(id),
    listFornecedoresAtivos(),
    listProdutosAtivos(),
  ])

  if (!carga) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Editar carga</h1>
      <CargaForm carga={carga} fornecedores={fornecedores} produtosDisponiveis={produtos} />
    </div>
  )
}
```

- [ ] **Step 5: Verificar tipos, build e suite completa**

```bash
npx tsc --noEmit
npm run build
npm test
```

Esperado: `tsc`/`build` sem erro; `npm test` com todos os testes verdes exceto os já conhecidos como rate-limited em `tests/user-actions.test.ts` (limitação externa da API de Auth do Supabase, não relacionada a este módulo).

- [ ] **Step 6: Testar manualmente o fluxo completo**

```bash
npm run dev
```

Pré-requisito: tenha pelo menos um fornecedor e dois produtos ativos cadastrados (crie via `/fornecedores` e `/produtos` se ainda não tiver).

Logado como Admin:
1. Em `/cargas`, clique "Nova carga". Selecione um fornecedor, preencha nome e data.
2. Clique "Adicionar produto" — confirme que o modal abre de verdade (overlay sobre a tela, fecha com Esc/clique fora/botão X). Selecione um produto, quantidade e valor unitário, clique "Adicionar" — confirme que aparece na tabela de itens com o subtotal certo e o modal fecha.
3. Repita para um segundo produto — confirme que o total soma corretamente e que o produto já adicionado não aparece mais no seletor do modal.
4. Tente clicar "Salvar carga" antes de adicionar nenhum item (numa nova aba/tela) — confirme que o botão fica desabilitado com a lista vazia.
5. Clique "Salvar carga" com os itens — confirme redirecionamento para `/cargas` e a carga aparecendo na lista com o total certo.
6. Edite a carga: remova um item, adicione outro diferente, mude o nome — salve e confirme que a lista de itens foi substituída corretamente.
7. Busque pelo nome da carga e pelo nome do fornecedor — confirme que os dois filtram.
8. Inative e reative a carga.
9. Apague a carga de teste diretamente no Supabase Cloud (SQL Editor: `delete from cargas where nome = '<nome usado>';` — o `on delete cascade` remove os itens junto) para não deixar dados de teste em produção.

- [ ] **Step 7: Commitar**

```bash
git add "app/(app)/cargas/novo" "app/(app)/cargas/[id]" components/cargas/carga-form.tsx components/cargas/adicionar-produto-modal.tsx
git commit -m "feat: add carga create/edit form with manual product-adding modal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
