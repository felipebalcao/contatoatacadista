# Cadastro de Fornecedores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o módulo de Fornecedores (PF/PJ), espelhando o CRUD de Clientes, incluindo o registro do `module_key` `fornecedores` na Fundação (que ainda não existe, diferente de `clientes`/`produtos`).

**Architecture:** Nova tabela `fornecedores`, estruturalmente idêntica a `clientes`, protegida por RLS reaproveitando `has_module_access('fornecedores')`. Antes disso, uma migração registra `'fornecedores'` como `module_key` válido (altera o `check` de `role_permissions`) e concede a permissão ao papel Admin, replicando o seed original da Fundação. Server Actions em `actions/fornecedor-actions.ts` seguem o padrão hardened de `actions/cliente-actions.ts` (`assertModuleAccess` na primeira linha, colunas explícitas no insert/update, filtro de busca com aspas duplas). UI em páginas dedicadas, reaproveitando `lib/validation/documento.ts` sem alterações.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 (strict), Tailwind CSS + shadcn/ui (`@base-ui/react`), Supabase (Postgres, Auth, RLS — projeto Cloud existente), Vitest, Vercel.

**Spec:** [docs/superpowers/specs/2026-09-03-fornecedores-design.md](../specs/2026-09-03-fornecedores-design.md)

## Global Constraints

- Segue a stack e convenções já estabelecidas: Next.js App Router, TypeScript `strict`, Tailwind + shadcn/ui (nenhuma outra lib de UI), Supabase com RLS, Vitest, npm.
- Toda tabela nova precisa de Row Level Security habilitada — nunca deixar tabela sem policy.
- Documento (CPF/CNPJ) validado por dígito verificador (módulo 11) tanto no client quanto na Server Action — a Server Action é a fonte da verdade. Reaproveita `lib/validation/documento.ts` tal como está, sem modificações.
- `documento` armazenado somente com dígitos (sem máscara/pontuação); normalização acontece antes de salvar ou comparar.
- Sem exclusão física de fornecedor pela aplicação — toda "remoção" é `ativo=false` via `toggleFornecedorAtivo`. Nenhuma policy de `delete` na tabela `fornecedores`.
- Toda Server Action exportada em `fornecedor-actions.ts` chama `await assertModuleAccess('fornecedores')` como primeira linha (endurecimento já aplicado em `cliente-actions.ts`/`role-actions.ts`/`user-actions.ts` — nunca confiar só em `requireModuleAccess` na página).
- Busca por nome usa `quotePostgrestValue` (aspas duplas), não escapar vírgula/parênteses com backslash — o PostgREST não honra escaping de vírgula dentro de `.or()` fora de aspas duplas (bug já corrigido em Clientes).
- Insert/update sempre enumeram colunas explicitamente — nunca espalhar (`...input`) o objeto de input bruto direto na chamada do Supabase (proteção contra mass-assignment).
- **Gotcha conhecido deste projeto:** o `Button` de `components/ui/button.tsx` embrulha `@base-ui/react`, não Radix, e **não tem prop `asChild`**. Para um link estilizado como botão, usar `buttonVariants({ variant, size })` aplicado à `className` de um `<Link>` normal.
- `SUPABASE_SERVICE_ROLE_KEY` só em código server-only (`'use server'` ou `lib/supabase/admin.ts`), nunca em Client Components.
- Toda tela sob `/fornecedores` protegida por `requireModuleAccess('fornecedores')` (redireciona para `/acesso-negado`), mesmo padrão de Clientes/Produtos/Usuários.

---

### Task 1: Registrar o `module_key` `fornecedores` e criar a tabela com RLS

**Files:**
- Create: `supabase/migrations/0003_fornecedores.sql`

**Interfaces:**
- Consumes: função `has_module_access(module text) returns boolean` (`0001_fundacao.sql`); tabelas `roles`/`role_permissions` (`0001_fundacao.sql`).
- Produces: `'fornecedores'` como valor aceito em `role_permissions.module_key`; permissão do módulo concedida ao papel `Admin`; tabela `fornecedores` com RLS habilitada e policies de select/insert/update checando `has_module_access('fornecedores')`.

- [ ] **Step 1: Escrever a migração**

Crie `supabase/migrations/0003_fornecedores.sql`:

```sql
-- Registra 'fornecedores' como module_key válido
alter table role_permissions drop constraint role_permissions_module_key_check;
alter table role_permissions add constraint role_permissions_module_key_check
  check (module_key in ('dashboard','cargas','clientes','produtos','fornecedores','usuarios'));

-- Concede o módulo ao Admin, mesmo padrão do seed original em 0001_fundacao.sql
insert into role_permissions (role_id, module_key)
select id, 'fornecedores'
from roles
where nome = 'Admin';

-- Tabela de fornecedores, estrutura idêntica a clientes
create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pf', 'pj')),
  documento text not null unique,
  nome text not null,
  nome_fantasia text,
  telefone text,
  email text,
  endereco_rua text,
  endereco_numero text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_uf text,
  endereco_cep text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table fornecedores enable row level security;

create policy "fornecedores_select_com_acesso"
  on fornecedores for select using (has_module_access('fornecedores'));

create policy "fornecedores_insert_com_acesso"
  on fornecedores for insert with check (has_module_access('fornecedores'));

create policy "fornecedores_update_com_acesso"
  on fornecedores for update using (has_module_access('fornecedores'));
```

- [ ] **Step 2: Aplicar a migração no projeto Supabase Cloud**

Abra o SQL Editor do projeto Supabase Cloud (Project Settings → SQL Editor) e execute o conteúdo de `supabase/migrations/0003_fornecedores.sql`.

Se o `alter table ... drop constraint role_permissions_module_key_check` falhar por nome de constraint diferente do esperado, rode antes, no mesmo SQL Editor:

```sql
select conname from pg_constraint
where conrelid = 'role_permissions'::regclass and contype = 'c';
```

E ajuste o nome no `drop constraint` para o valor retornado antes de reexecutar.

- [ ] **Step 3: Verificar tabela, RLS e permissão do Admin**

```bash
set -a; source .env.local; set +a

curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/fornecedores?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/role_permissions?module_key=eq.fornecedores&select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Esperado: primeira chamada retorna `[]` (tabela existe, vazia); segunda retorna um array com um objeto (a permissão do Admin para `fornecedores`).

- [ ] **Step 4: Commitar**

```bash
git add supabase/migrations/0003_fornecedores.sql
git commit -m "feat: register fornecedores module_key and add fornecedores table with RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Registrar o módulo no frontend (tipo, navegação, permissões)

**Files:**
- Modify: `lib/types/database.ts`, `lib/auth/permissions.ts`, `components/layout/sidebar.tsx`, `components/usuarios/role-form-dialog.tsx`, `components/usuarios/papeis-page-client.tsx`, `tests/permissions.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores neste arquivo (é registro de tipo/config).
- Produces: `ModuleKey` incluindo `'fornecedores'`; `MODULE_KEYS` (`lib/auth/permissions.ts`) na ordem `['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios']`; item "Fornecedores" navegável na sidebar; módulo selecionável na tela de Papéis.

- [ ] **Step 1: Adicionar `'fornecedores'` ao tipo `ModuleKey`**

Em `lib/types/database.ts`, linha 1, troque:

```ts
export type ModuleKey = 'dashboard' | 'cargas' | 'clientes' | 'produtos' | 'usuarios'
```

por:

```ts
export type ModuleKey = 'dashboard' | 'cargas' | 'clientes' | 'produtos' | 'fornecedores' | 'usuarios'
```

- [ ] **Step 2: Atualizar `MODULE_KEYS`**

Em `lib/auth/permissions.ts`, linha 3, troque:

```ts
export const MODULE_KEYS: ModuleKey[] = ['dashboard', 'cargas', 'clientes', 'produtos', 'usuarios']
```

por:

```ts
export const MODULE_KEYS: ModuleKey[] = ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios']
```

- [ ] **Step 3: Atualizar o teste de `MODULE_KEYS`**

Em `tests/permissions.test.ts`, troque o bloco `describe('MODULE_KEYS', ...)` (linhas 18-22) por:

```ts
describe('MODULE_KEYS', () => {
  it('contém exatamente os seis módulos desta fase, na ordem de navegação', () => {
    expect(MODULE_KEYS).toEqual(['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'])
  })
})
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npm test -- permissions
```

Esperado: PASS (4 testes).

- [ ] **Step 5: Adicionar o item "Fornecedores" na sidebar**

Em `components/layout/sidebar.tsx`, adicione `Building2` ao import de ícones (linha 5-13):

```ts
import {
  Building2,
  LayoutDashboard,
  Package,
  Settings,
  Tag,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'
```

E adicione a entrada no array `NAV_ITEMS` (entre `produtos` e `usuarios`):

```ts
const NAV_ITEMS: { key: ModuleKey; label: string; href: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'cargas', label: 'Cargas', href: '/cargas', icon: Package },
  { key: 'clientes', label: 'Clientes', href: '/clientes', icon: Users },
  { key: 'produtos', label: 'Produtos', href: '/produtos', icon: Tag },
  { key: 'fornecedores', label: 'Fornecedores', href: '/fornecedores', icon: Building2 },
  { key: 'usuarios', label: 'Usuários / Config', href: '/usuarios', icon: Settings },
]
```

- [ ] **Step 6: Adicionar o rótulo do módulo nas telas de Papéis**

Em `components/usuarios/role-form-dialog.tsx`, atualize `MODULE_LABELS` (linhas 12-18):

```ts
const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  cargas: 'Cargas',
  clientes: 'Clientes',
  produtos: 'Produtos',
  fornecedores: 'Fornecedores',
  usuarios: 'Usuários',
}
```

Em `components/usuarios/papeis-page-client.tsx`, atualize `MODULE_LABELS` (linhas 9-15) da mesma forma.

- [ ] **Step 7: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: sem erro (os dois `Record<ModuleKey, string>` precisam cobrir `fornecedores`, senão o TypeScript acusa propriedade faltando).

- [ ] **Step 8: Commitar**

```bash
git add lib/types/database.ts lib/auth/permissions.ts tests/permissions.test.ts components/layout/sidebar.tsx components/usuarios/role-form-dialog.tsx components/usuarios/papeis-page-client.tsx
git commit -m "feat: register fornecedores in ModuleKey, navigation and role permissions UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Tipos e Server Actions de fornecedores

**Files:**
- Modify: `lib/types/database.ts`
- Create: `actions/fornecedor-actions.ts`
- Test: `tests/fornecedor-actions.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()` (`lib/supabase/admin.ts`), `assertModuleAccess` (`lib/auth/assert-module-access.ts`), `normalizarDocumento`/`validarDocumento` (`lib/validation/documento.ts`), `getCurrentProfile` (`lib/auth/get-current-profile.ts`, para mock em teste).
- Produces:
  - Tipos `Fornecedor`, `FornecedorInput` em `lib/types/database.ts` (reaproveita `TipoCliente` já existente para o campo `tipo`, já que é o mesmo domínio `'pf' | 'pj'`).
  - `listFornecedores(query?: string): Promise<Fornecedor[]>`
  - `getFornecedor(id: string): Promise<Fornecedor | null>`
  - `createFornecedor(input: FornecedorInput): Promise<Fornecedor>`
  - `updateFornecedor(id: string, input: FornecedorInput): Promise<Fornecedor>`
  - `toggleFornecedorAtivo(id: string, ativo: boolean): Promise<void>`
  - todas em `actions/fornecedor-actions.ts`.

- [ ] **Step 1: Adicionar os tipos em `lib/types/database.ts`**

Adicione ao final do arquivo:

```ts
export interface Fornecedor {
  id: string
  tipo: TipoCliente
  documento: string
  nome: string
  nome_fantasia: string | null
  telefone: string | null
  email: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
}

export interface FornecedorInput {
  tipo: TipoCliente
  documento: string
  nome: string
  nome_fantasia: string | null
  telefone: string | null
  email: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  observacoes: string | null
}
```

- [ ] **Step 2: Escrever o teste de integração das Server Actions (falhando)**

Crie `tests/fornecedor-actions.test.ts`:

```ts
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createFornecedor,
  updateFornecedor,
  listFornecedores,
  toggleFornecedorAtivo,
} from '@/actions/fornecedor-actions'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import type { FornecedorInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const DOCUMENTO_TESTE = '11144477735'

const inputBase: FornecedorInput = {
  tipo: 'pf',
  documento: '111.444.777-35',
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

describe('fornecedor-actions', () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('documento', DOCUMENTO_TESTE)
  })

  it('cria um fornecedor PF válido', async () => {
    const fornecedor = await createFornecedor(inputBase)

    expect(fornecedor.documento).toBe(DOCUMENTO_TESTE)
    expect(fornecedor.ativo).toBe(true)
  })

  it('rejeita documento com dígito verificador inválido', async () => {
    await expect(
      createFornecedor({ ...inputBase, documento: '111.444.777-36' })
    ).rejects.toThrow('Documento inválido.')
  })

  it('rejeita documento duplicado', async () => {
    await createFornecedor({ ...inputBase, nome: 'Primeiro Cadastro' })

    await expect(
      createFornecedor({ ...inputBase, nome: 'Segundo Cadastro' })
    ).rejects.toThrow('Já existe um fornecedor cadastrado com esse documento.')
  })

  it('atualiza um fornecedor existente', async () => {
    const fornecedor = await createFornecedor({ ...inputBase, nome: 'Nome Original' })

    const atualizado = await updateFornecedor(fornecedor.id, { ...inputBase, nome: 'Nome Atualizado' })

    expect(atualizado.nome).toBe('Nome Atualizado')
  })

  it('lista fornecedores filtrando por nome, excluindo os que não combinam', async () => {
    await createFornecedor({ ...inputBase, nome: 'Fornecedor Buscável' })
    await createFornecedor({
      ...inputBase,
      tipo: 'pj',
      documento: '11.222.333/0001-81',
      nome: 'Outra Empresa Qualquer',
    })

    const resultados = await listFornecedores('Buscável')

    expect(resultados.some((f) => f.documento === DOCUMENTO_TESTE)).toBe(true)
    expect(resultados.some((f) => f.documento === '11222333000181')).toBe(false)

    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('documento', '11222333000181')
  })

  it('inativa e reativa um fornecedor', async () => {
    const fornecedor = await createFornecedor(inputBase)

    await toggleFornecedorAtivo(fornecedor.id, false)
    let lista = await listFornecedores()
    expect(lista.find((f) => f.id === fornecedor.id)?.ativo).toBe(false)

    await toggleFornecedorAtivo(fornecedor.id, true)
    lista = await listFornecedores()
    expect(lista.find((f) => f.id === fornecedor.id)?.ativo).toBe(true)
  })

  it('rejeita chamadas de um usuário sem permissão de fornecedores', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...ADMIN_PROFILE,
      permissions: ['dashboard'],
    } as never)

    await expect(listFornecedores()).rejects.toThrow('Acesso negado.')
  })

  it('busca por nome contendo vírgula não quebra o filtro', async () => {
    await createFornecedor({ ...inputBase, nome: 'Fornecedor, Com Vírgula' })

    const resultados = await listFornecedores('Fornecedor, Com Vírgula')

    expect(resultados.some((f) => f.documento === DOCUMENTO_TESTE)).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

```bash
npm test -- fornecedor-actions
```

Esperado: FAIL — `Cannot find module '@/actions/fornecedor-actions'`.

- [ ] **Step 4: Implementar `actions/fornecedor-actions.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import { normalizarDocumento, validarDocumento } from '@/lib/validation/documento'
import type { Fornecedor, FornecedorInput } from '@/lib/types/database'

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

export async function listFornecedores(query?: string): Promise<Fornecedor[]> {
  await assertModuleAccess('fornecedores')
  const supabase = createAdminClient()
  let request = supabase.from('fornecedores').select('*').order('nome')

  if (query) {
    const documentoBusca = normalizarDocumento(query)
    const filtros = [`nome.ilike.${quotePostgrestValue(`%${query}%`)}`]
    if (documentoBusca) {
      filtros.push(`documento.ilike.%${documentoBusca}%`)
    }
    request = request.or(filtros.join(','))
  }

  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data ?? []) as Fornecedor[]
}

export async function getFornecedor(id: string): Promise<Fornecedor | null> {
  await assertModuleAccess('fornecedores')
  const supabase = createAdminClient()
  const { data } = await supabase.from('fornecedores').select('*').eq('id', id).single()
  return (data as Fornecedor) ?? null
}

export async function createFornecedor(input: FornecedorInput): Promise<Fornecedor> {
  await assertModuleAccess('fornecedores')
  const documento = normalizarDocumento(input.documento)

  if (!validarDocumento(input.tipo, documento)) {
    throw new Error('Documento inválido.')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('fornecedores')
    .insert({
      tipo: input.tipo,
      documento,
      nome: input.nome,
      nome_fantasia: input.nome_fantasia,
      telefone: input.telefone,
      email: input.email,
      endereco_rua: input.endereco_rua,
      endereco_numero: input.endereco_numero,
      endereco_bairro: input.endereco_bairro,
      endereco_cidade: input.endereco_cidade,
      endereco_uf: input.endereco_uf,
      endereco_cep: input.endereco_cep,
      observacoes: input.observacoes,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um fornecedor cadastrado com esse documento.')
    }
    throw new Error(error.message)
  }

  return data as Fornecedor
}

export async function updateFornecedor(id: string, input: FornecedorInput): Promise<Fornecedor> {
  await assertModuleAccess('fornecedores')
  const documento = normalizarDocumento(input.documento)

  if (!validarDocumento(input.tipo, documento)) {
    throw new Error('Documento inválido.')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('fornecedores')
    .update({
      tipo: input.tipo,
      documento,
      nome: input.nome,
      nome_fantasia: input.nome_fantasia,
      telefone: input.telefone,
      email: input.email,
      endereco_rua: input.endereco_rua,
      endereco_numero: input.endereco_numero,
      endereco_bairro: input.endereco_bairro,
      endereco_cidade: input.endereco_cidade,
      endereco_uf: input.endereco_uf,
      endereco_cep: input.endereco_cep,
      observacoes: input.observacoes,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um fornecedor cadastrado com esse documento.')
    }
    throw new Error(error.message)
  }

  return data as Fornecedor
}

export async function toggleFornecedorAtivo(id: string, ativo: boolean): Promise<void> {
  await assertModuleAccess('fornecedores')
  const supabase = createAdminClient()
  const { error } = await supabase.from('fornecedores').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

```bash
npm test -- fornecedor-actions
```

Esperado: PASS (8 testes).

- [ ] **Step 6: Commitar**

```bash
git add lib/types/database.ts actions/fornecedor-actions.ts tests/fornecedor-actions.test.ts
git commit -m "feat: add fornecedor types and Server Actions with CPF/CNPJ validation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Listagem de fornecedores com busca e ativar/inativar

**Files:**
- Create: `components/fornecedores/fornecedores-table.tsx`, `components/fornecedores/fornecedores-page-client.tsx`, `app/(app)/fornecedores/page.tsx`

**Interfaces:**
- Consumes: `requireModuleAccess('fornecedores')` (Fundação), `listFornecedores`/`toggleFornecedorAtivo` (Task 3), `buttonVariants` de `components/ui/button.tsx`.

- [ ] **Step 1: Criar `FornecedoresTable`**

Crie `components/fornecedores/fornecedores-table.tsx`:

```tsx
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Fornecedor, TipoCliente } from '@/lib/types/database'

const TIPO_LABELS: Record<TipoCliente, string> = { pf: 'CPF', pj: 'CNPJ' }

function formatarDocumento(tipo: TipoCliente, documento: string): string {
  if (tipo === 'pf') {
    return documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function FornecedoresTable({
  fornecedores,
  onToggleAtivo,
}: {
  fornecedores: Fornecedor[]
  onToggleAtivo: (id: string, ativo: boolean) => void
}) {
  if (fornecedores.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Nenhum fornecedor cadastrado ainda.
      </p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Nome</th>
          <th className="py-2">Documento</th>
          <th className="py-2">Status</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {fornecedores.map((fornecedor) => (
          <tr key={fornecedor.id} className="border-b">
            <td className="py-2">{fornecedor.nome}</td>
            <td className="py-2">
              {TIPO_LABELS[fornecedor.tipo]}: {formatarDocumento(fornecedor.tipo, fornecedor.documento)}
            </td>
            <td className="py-2">
              <span
                className={
                  fornecedor.ativo
                    ? 'text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 text-xs'
                    : 'text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 text-xs'
                }
              >
                {fornecedor.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            <td className="py-2 text-right space-x-2">
              <Link href={`/fornecedores/${fornecedor.id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Editar
              </Link>
              <Button variant="ghost" size="sm" onClick={() => onToggleAtivo(fornecedor.id, !fornecedor.ativo)}>
                {fornecedor.ativo ? 'Inativar' : 'Reativar'}
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

Crie `components/fornecedores/fornecedores-page-client.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FornecedoresTable } from './fornecedores-table'
import { listFornecedores, toggleFornecedorAtivo } from '@/actions/fornecedor-actions'
import type { Fornecedor } from '@/lib/types/database'

export function FornecedoresPageClient({ fornecedoresIniciais }: { fornecedoresIniciais: Fornecedor[] }) {
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais)
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBuscar(formData: FormData) {
    const query = (formData.get('busca') as string) ?? ''
    setBusca(query)
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await listFornecedores(query || undefined)
        setFornecedores(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar fornecedores.')
      }
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        await toggleFornecedorAtivo(id, ativo)
        const resultado = await listFornecedores(busca || undefined)
        setFornecedores(resultado)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao atualizar fornecedor.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Fornecedores</h1>
        <Link href="/fornecedores/novo" className={buttonVariants({ variant: 'default' })}>
          Novo fornecedor
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={handleBuscar} className="flex gap-2 max-w-sm">
        <Input name="busca" placeholder="Buscar por nome ou documento" defaultValue={busca} />
        <Button type="submit" variant="outline" disabled={isPending}>
          Buscar
        </Button>
      </form>
      <FornecedoresTable fornecedores={fornecedores} onToggleAtivo={handleToggleAtivo} />
    </div>
  )
}
```

- [ ] **Step 3: Criar a página de listagem**

Crie `app/(app)/fornecedores/page.tsx`:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listFornecedores } from '@/actions/fornecedor-actions'
import { FornecedoresPageClient } from '@/components/fornecedores/fornecedores-page-client'

export default async function FornecedoresPage() {
  await requireModuleAccess('fornecedores')
  const fornecedores = await listFornecedores()

  return <FornecedoresPageClient fornecedoresIniciais={fornecedores} />
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

Acesse `/fornecedores` logado como Admin — confirme que o item "Fornecedores" aparece na sidebar e que a página mostra "Nenhum fornecedor cadastrado ainda." (lista vazia nesta fase).

- [ ] **Step 6: Commitar**

```bash
git add "app/(app)/fornecedores/page.tsx" components/fornecedores/fornecedores-table.tsx components/fornecedores/fornecedores-page-client.tsx
git commit -m "feat: add fornecedores listing page with search and ativar/inativar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Formulário de criar/editar fornecedor

**Files:**
- Create: `components/fornecedores/fornecedor-form.tsx`, `app/(app)/fornecedores/novo/page.tsx`, `app/(app)/fornecedores/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `createFornecedor`/`updateFornecedor`/`getFornecedor` (Task 3), `requireModuleAccess` (Fundação), `validarDocumento` (`lib/validation/documento.ts`).

- [ ] **Step 1: Criar o formulário compartilhado**

Crie `components/fornecedores/fornecedor-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFornecedor, updateFornecedor } from '@/actions/fornecedor-actions'
import { validarDocumento } from '@/lib/validation/documento'
import type { Fornecedor, FornecedorInput, TipoCliente } from '@/lib/types/database'

export function FornecedorForm({ fornecedor }: { fornecedor?: Fornecedor }) {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoCliente>(fornecedor?.tipo ?? 'pf')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEditing = Boolean(fornecedor)

  function handleSubmit(formData: FormData) {
    setError(null)

    const documento = formData.get('documento') as string

    if (!validarDocumento(tipo, documento)) {
      setError('Documento inválido.')
      return
    }

    const input: FornecedorInput = {
      tipo,
      documento,
      nome: formData.get('nome') as string,
      nome_fantasia: tipo === 'pj' ? (formData.get('nome_fantasia') as string) || null : null,
      telefone: (formData.get('telefone') as string) || null,
      email: (formData.get('email') as string) || null,
      endereco_rua: (formData.get('endereco_rua') as string) || null,
      endereco_numero: (formData.get('endereco_numero') as string) || null,
      endereco_bairro: (formData.get('endereco_bairro') as string) || null,
      endereco_cidade: (formData.get('endereco_cidade') as string) || null,
      endereco_uf: (formData.get('endereco_uf') as string) || null,
      endereco_cep: (formData.get('endereco_cep') as string) || null,
      observacoes: (formData.get('observacoes') as string) || null,
    }

    startTransition(async () => {
      try {
        if (isEditing && fornecedor) {
          await updateFornecedor(fornecedor.id, input)
        } else {
          await createFornecedor(input)
        }
        router.push('/fornecedores')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar fornecedor.')
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="tipo"
            value="pf"
            checked={tipo === 'pf'}
            onChange={() => setTipo('pf')}
          />
          Pessoa Física
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="tipo"
            value="pj"
            checked={tipo === 'pj'}
            onChange={() => setTipo('pj')}
          />
          Pessoa Jurídica
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documento">{tipo === 'pf' ? 'CPF' : 'CNPJ'}</Label>
          <Input id="documento" name="documento" defaultValue={fornecedor?.documento} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">{tipo === 'pf' ? 'Nome completo' : 'Razão social'}</Label>
          <Input id="nome" name="nome" defaultValue={fornecedor?.nome} required />
        </div>
      </div>

      {tipo === 'pj' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome_fantasia">Nome fantasia</Label>
          <Input id="nome_fantasia" name="nome_fantasia" defaultValue={fornecedor?.nome_fantasia ?? ''} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" name="telefone" defaultValue={fornecedor?.telefone ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={fornecedor?.email ?? ''} />
        </div>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Endereço</legend>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label htmlFor="endereco_rua">Rua</Label>
            <Input id="endereco_rua" name="endereco_rua" defaultValue={fornecedor?.endereco_rua ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_numero">Número</Label>
            <Input id="endereco_numero" name="endereco_numero" defaultValue={fornecedor?.endereco_numero ?? ''} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_bairro">Bairro</Label>
            <Input id="endereco_bairro" name="endereco_bairro" defaultValue={fornecedor?.endereco_bairro ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_cidade">Cidade</Label>
            <Input id="endereco_cidade" name="endereco_cidade" defaultValue={fornecedor?.endereco_cidade ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_uf">UF</Label>
            <Input id="endereco_uf" name="endereco_uf" maxLength={2} defaultValue={fornecedor?.endereco_uf ?? ''} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 max-w-xs">
          <Label htmlFor="endereco_cep">CEP</Label>
          <Input id="endereco_cep" name="endereco_cep" defaultValue={fornecedor?.endereco_cep ?? ''} />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <textarea
          id="observacoes"
          name="observacoes"
          defaultValue={fornecedor?.observacoes ?? ''}
          className="border rounded-md px-3 py-2 text-sm min-h-24"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/fornecedores')}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Criar a página de novo fornecedor**

Crie `app/(app)/fornecedores/novo/page.tsx`:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { FornecedorForm } from '@/components/fornecedores/fornecedor-form'

export default async function NovoFornecedorPage() {
  await requireModuleAccess('fornecedores')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Novo fornecedor</h1>
      <FornecedorForm />
    </div>
  )
}
```

- [ ] **Step 3: Criar a página de editar fornecedor**

Crie `app/(app)/fornecedores/[id]/editar/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getFornecedor } from '@/actions/fornecedor-actions'
import { FornecedorForm } from '@/components/fornecedores/fornecedor-form'

export default async function EditarFornecedorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModuleAccess('fornecedores')
  const { id } = await params
  const fornecedor = await getFornecedor(id)

  if (!fornecedor) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Editar fornecedor</h1>
      <FornecedorForm fornecedor={fornecedor} />
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
1. Em `/fornecedores`, clique "Novo fornecedor". Cadastre um fornecedor PF com CPF `111.444.777-35` — confirme redirecionamento para `/fornecedores` e o fornecedor aparecendo na lista.
2. Cadastre um fornecedor PJ com CNPJ `11.222.333/0001-81`, incluindo nome fantasia — confirme que o campo aparece só para PJ e o fornecedor é salvo corretamente.
3. Tente cadastrar outro fornecedor com o mesmo CPF `111.444.777-35` — confirme a mensagem "Já existe um fornecedor cadastrado com esse documento." sem sair da tela.
4. Busque por parte do nome de um dos fornecedores criados — confirme que a lista filtra corretamente. Busque pelo documento — confirme que também filtra.
5. Edite um dos fornecedores (mude o nome) — confirme que a alteração aparece na lista.
6. Clique "Inativar" em um fornecedor — confirme que o status muda para "Inativo". Clique "Reativar" — confirme volta para "Ativo".
7. Em `/usuarios/papeis`, edite um papel e confirme que "Fornecedores" aparece na lista de módulos selecionáveis.
8. Apague os dois fornecedores de teste diretamente no Supabase Cloud (SQL Editor: `delete from fornecedores where documento in ('11144477735', '11222333000181');`) para não deixar dados de teste em produção.

- [ ] **Step 6: Commitar**

```bash
git add "app/(app)/fornecedores/novo" "app/(app)/fornecedores/[id]" components/fornecedores/fornecedor-form.tsx
git commit -m "feat: add fornecedor create/edit form with PF/PJ toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
