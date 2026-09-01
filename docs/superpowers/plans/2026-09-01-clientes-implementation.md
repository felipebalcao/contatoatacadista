# Cadastro de Clientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder "em construção" de `/clientes` por um CRUD completo de clientes (PF/PJ), com validação de CPF/CNPJ, busca e inativação, construído sobre a autenticação/autorização já existente da Fundação.

**Architecture:** Nova tabela `clientes` no mesmo projeto Supabase Cloud da Fundação, protegida por RLS reaproveitando `has_module_access('clientes')`. Server Actions em `actions/cliente-actions.ts` fazem toda leitura/escrita via `createAdminClient()`, seguindo exatamente o padrão de `actions/role-actions.ts`/`actions/user-actions.ts`. UI em páginas dedicadas (não modal, dado o volume de campos): listagem com busca em `/clientes`, formulário compartilhado entre criar/editar.

**Tech Stack:** Next.js 14+ (App Router), TypeScript 5 (strict), Tailwind CSS + shadcn/ui, Supabase (Postgres, Auth, RLS — projeto Cloud existente), Vitest, Vercel.

**Spec:** [docs/superpowers/specs/2026-09-01-clientes-design.md](../specs/2026-09-01-clientes-design.md)

## Global Constraints

- Segue a stack e as convenções já estabelecidas pela Fundação: Next.js App Router, TypeScript `strict`, Tailwind + shadcn/ui (nenhuma outra lib de UI), Supabase com RLS, Vitest, npm.
- Toda tabela nova precisa de Row Level Security habilitada — nunca deixar tabela sem policy.
- Documento (CPF/CNPJ) é validado por dígito verificador (módulo 11) tanto no client quanto na Server Action — a Server Action é a fonte da verdade, nunca confiar só na validação client-side.
- `documento` é armazenado somente com dígitos (sem máscara/pontuação); normalização acontece antes de salvar ou comparar.
- Sem exclusão física de cliente pela aplicação — toda "remoção" é `ativo=false` via `toggleClienteAtivo`. Nenhuma policy de `delete` na tabela `clientes`.
- **Gotcha conhecido deste projeto:** o `Button` de `components/ui/button.tsx` embrulha `@base-ui/react`, não Radix, e **não tem prop `asChild`** (usar `<Button asChild>` quebra `tsc --noEmit`/`next build` — já causou retrabalho nas Tasks 5 e 7 da Fundação). Para um link estilizado como botão, usar `buttonVariants({ variant, size })` aplicado à `className` de um `<Link>` normal.
- `SUPABASE_SERVICE_ROLE_KEY` só em código server-only (`'use server'` ou `lib/supabase/admin.ts`), nunca em Client Components.

---

### Task 1: Migração do banco — tabela `clientes` e RLS

**Files:**
- Create: `supabase/migrations/0002_clientes.sql`

**Interfaces:**
- Consumes: função `has_module_access(module text) returns boolean` (criada na migração `0001_fundacao.sql`).
- Produces: tabela `clientes` com RLS habilitada, policies de select/insert/update checando `has_module_access('clientes')`.

- [ ] **Step 1: Escrever a migração**

Crie `supabase/migrations/0002_clientes.sql`:

```sql
create table clientes (
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

alter table clientes enable row level security;

create policy "clientes_select_com_acesso"
  on clientes for select using (has_module_access('clientes'));

create policy "clientes_insert_com_acesso"
  on clientes for insert with check (has_module_access('clientes'));

create policy "clientes_update_com_acesso"
  on clientes for update using (has_module_access('clientes'));
```

- [ ] **Step 2: Aplicar a migração no projeto Supabase Cloud**

Este projeto não usa Supabase local (sem Docker disponível no ambiente — ver decisão registrada na Task 2 da Fundação). Abra o SQL Editor do mesmo projeto Supabase Cloud já usado pela Fundação (Project Settings → SQL Editor) e execute o conteúdo de `supabase/migrations/0002_clientes.sql`.

- [ ] **Step 3: Verificar que a tabela foi criada com RLS ativa**

```bash
set -a; source .env.local; set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/clientes?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Esperado: `[]` (tabela vazia, sem erro — confirma que a tabela existe e a policy de select libera o service role).

- [ ] **Step 4: Commitar**

```bash
git add supabase/migrations/0002_clientes.sql
git commit -m "feat: add clientes table with RLS reusing has_module_access"
```

---

### Task 2: Validação de CPF/CNPJ

**Files:**
- Create: `lib/validation/documento.ts`
- Test: `tests/documento.test.ts`

**Interfaces:**
- Produces:
  - `normalizarDocumento(documento: string): string` — remove tudo que não for dígito.
  - `validarCpf(cpf: string): boolean`
  - `validarCnpj(cnpj: string): boolean`
  - `validarDocumento(tipo: 'pf' | 'pj', documento: string): boolean`

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `tests/documento.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  validarCpf,
  validarCnpj,
  validarDocumento,
  normalizarDocumento,
} from '@/lib/validation/documento'

describe('validarCpf', () => {
  it('aceita um CPF válido', () => {
    expect(validarCpf('111.444.777-35')).toBe(true)
  })

  it('rejeita um CPF com dígito verificador errado', () => {
    expect(validarCpf('111.444.777-36')).toBe(false)
  })

  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(validarCpf('111.111.111-11')).toBe(false)
  })

  it('rejeita CPF com tamanho incorreto', () => {
    expect(validarCpf('123')).toBe(false)
  })
})

describe('validarCnpj', () => {
  it('aceita um CNPJ válido', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true)
  })

  it('rejeita um CNPJ com dígito verificador errado', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false)
  })

  it('rejeita CNPJ com todos os dígitos iguais', () => {
    expect(validarCnpj('11.111.111/1111-11')).toBe(false)
  })

  it('rejeita CNPJ com tamanho incorreto', () => {
    expect(validarCnpj('123')).toBe(false)
  })
})

describe('validarDocumento', () => {
  it('valida CPF quando tipo é pf', () => {
    expect(validarDocumento('pf', '111.444.777-35')).toBe(true)
  })

  it('valida CNPJ quando tipo é pj', () => {
    expect(validarDocumento('pj', '11.222.333/0001-81')).toBe(true)
  })
})

describe('normalizarDocumento', () => {
  it('remove pontuação, mantendo só dígitos', () => {
    expect(normalizarDocumento('111.444.777-35')).toBe('11144477735')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npm test -- documento
```

Esperado: FAIL — `Cannot find module '@/lib/validation/documento'`.

- [ ] **Step 3: Implementar `lib/validation/documento.ts`**

```ts
export function normalizarDocumento(documento: string): string {
  return documento.replace(/\D/g, '')
}

export function validarCpf(cpf: string): boolean {
  const digits = normalizarDocumento(cpf)
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  const calcCheckDigit = (base: string, factorStart: number): number => {
    let sum = 0
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * (factorStart - i)
    }
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const firstNine = digits.slice(0, 9)
  const firstCheck = calcCheckDigit(firstNine, 10)
  const firstTen = firstNine + firstCheck.toString()
  const secondCheck = calcCheckDigit(firstTen, 11)

  return digits === firstNine + firstCheck.toString() + secondCheck.toString()
}

export function validarCnpj(cnpj: string): boolean {
  const digits = normalizarDocumento(cnpj)
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false

  const calcCheckDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split('')
      .reduce((acc, digit, i) => acc + parseInt(digit, 10) * weights[i], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const firstTwelve = digits.slice(0, 12)
  const firstCheck = calcCheckDigit(firstTwelve, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  const firstThirteen = firstTwelve + firstCheck.toString()
  const secondCheck = calcCheckDigit(firstThirteen, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return digits === firstTwelve + firstCheck.toString() + secondCheck.toString()
}

export function validarDocumento(tipo: 'pf' | 'pj', documento: string): boolean {
  return tipo === 'pf' ? validarCpf(documento) : validarCnpj(documento)
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npm test -- documento
```

Esperado: PASS (9 testes).

- [ ] **Step 5: Commitar**

```bash
git add lib/validation/documento.ts tests/documento.test.ts
git commit -m "feat: add CPF/CNPJ check-digit validation"
```

---

### Task 3: Tipos e Server Actions de clientes

**Files:**
- Modify: `lib/types/database.ts`
- Create: `actions/cliente-actions.ts`
- Test: `tests/cliente-actions.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()` (`lib/supabase/admin.ts`), `normalizarDocumento`/`validarDocumento` (`lib/validation/documento.ts`, Task 2).
- Produces:
  - Tipos `TipoCliente`, `Cliente`, `ClienteInput` em `lib/types/database.ts`.
  - `listClientes(query?: string): Promise<Cliente[]>`
  - `getCliente(id: string): Promise<Cliente | null>`
  - `createCliente(input: ClienteInput): Promise<Cliente>`
  - `updateCliente(id: string, input: ClienteInput): Promise<Cliente>`
  - `toggleClienteAtivo(id: string, ativo: boolean): Promise<void>`
  - todas em `actions/cliente-actions.ts`.

- [ ] **Step 1: Adicionar os tipos em `lib/types/database.ts`**

Adicione ao final do arquivo:

```ts
export type TipoCliente = 'pf' | 'pj'

export interface Cliente {
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

export interface ClienteInput {
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

Crie `tests/cliente-actions.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createCliente,
  updateCliente,
  listClientes,
  toggleClienteAtivo,
} from '@/actions/cliente-actions'
import type { ClienteInput } from '@/lib/types/database'

const DOCUMENTO_TESTE = '11144477735'

const inputBase: ClienteInput = {
  tipo: 'pf',
  documento: '111.444.777-35',
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

describe('cliente-actions', () => {
  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('clientes').delete().eq('documento', DOCUMENTO_TESTE)
  })

  it('cria um cliente PF válido', async () => {
    const cliente = await createCliente(inputBase)

    expect(cliente.documento).toBe(DOCUMENTO_TESTE)
    expect(cliente.ativo).toBe(true)
  })

  it('rejeita documento com dígito verificador inválido', async () => {
    await expect(
      createCliente({ ...inputBase, documento: '111.444.777-36' })
    ).rejects.toThrow('Documento inválido.')
  })

  it('rejeita documento duplicado', async () => {
    await createCliente({ ...inputBase, nome: 'Primeiro Cadastro' })

    await expect(
      createCliente({ ...inputBase, nome: 'Segundo Cadastro' })
    ).rejects.toThrow('Já existe um cliente cadastrado com esse documento.')
  })

  it('atualiza um cliente existente', async () => {
    const cliente = await createCliente({ ...inputBase, nome: 'Nome Original' })

    const atualizado = await updateCliente(cliente.id, { ...inputBase, nome: 'Nome Atualizado' })

    expect(atualizado.nome).toBe('Nome Atualizado')
  })

  it('lista clientes filtrando por nome', async () => {
    await createCliente({ ...inputBase, nome: 'Cliente Buscável' })

    const resultados = await listClientes('Buscável')
    expect(resultados.some((c) => c.documento === DOCUMENTO_TESTE)).toBe(true)
  })

  it('inativa e reativa um cliente', async () => {
    const cliente = await createCliente(inputBase)

    await toggleClienteAtivo(cliente.id, false)
    let lista = await listClientes()
    expect(lista.find((c) => c.id === cliente.id)?.ativo).toBe(false)

    await toggleClienteAtivo(cliente.id, true)
    lista = await listClientes()
    expect(lista.find((c) => c.id === cliente.id)?.ativo).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

```bash
npm test -- cliente-actions
```

Esperado: FAIL — `Cannot find module '@/actions/cliente-actions'`.

- [ ] **Step 4: Implementar `actions/cliente-actions.ts`**

```ts
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
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

```bash
npm test -- cliente-actions
```

Esperado: PASS (6 testes).

- [ ] **Step 6: Commitar**

```bash
git add lib/types/database.ts actions/cliente-actions.ts tests/cliente-actions.test.ts
git commit -m "feat: add cliente types and Server Actions with CPF/CNPJ validation"
```

---

### Task 4: Listagem de clientes com busca e ativar/inativar

**Files:**
- Create: `components/clientes/clientes-table.tsx`, `components/clientes/clientes-page-client.tsx`
- Modify: `app/(app)/clientes/page.tsx` (substitui o placeholder "em construção")

**Interfaces:**
- Consumes: `requireModuleAccess('clientes')` (Fundação), `listClientes`/`toggleClienteAtivo` (Task 3), `buttonVariants` de `components/ui/button.tsx`.

- [ ] **Step 1: Criar `ClientesTable`**

Crie `components/clientes/clientes-table.tsx`:

```tsx
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Cliente, TipoCliente } from '@/lib/types/database'

const TIPO_LABELS: Record<TipoCliente, string> = { pf: 'CPF', pj: 'CNPJ' }

function formatarDocumento(tipo: TipoCliente, documento: string): string {
  if (tipo === 'pf') {
    return documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function ClientesTable({
  clientes,
  onToggleAtivo,
}: {
  clientes: Cliente[]
  onToggleAtivo: (id: string, ativo: boolean) => void
}) {
  if (clientes.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Nenhum cliente cadastrado ainda.
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
        {clientes.map((cliente) => (
          <tr key={cliente.id} className="border-b">
            <td className="py-2">{cliente.nome}</td>
            <td className="py-2">
              {TIPO_LABELS[cliente.tipo]}: {formatarDocumento(cliente.tipo, cliente.documento)}
            </td>
            <td className="py-2">
              <span
                className={
                  cliente.ativo
                    ? 'text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 text-xs'
                    : 'text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 text-xs'
                }
              >
                {cliente.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            <td className="py-2 text-right space-x-2">
              <Link href={`/clientes/${cliente.id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Editar
              </Link>
              <Button variant="ghost" size="sm" onClick={() => onToggleAtivo(cliente.id, !cliente.ativo)}>
                {cliente.ativo ? 'Inativar' : 'Reativar'}
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

Crie `components/clientes/clientes-page-client.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClientesTable } from './clientes-table'
import { listClientes, toggleClienteAtivo } from '@/actions/cliente-actions'
import type { Cliente } from '@/lib/types/database'

export function ClientesPageClient({ clientesIniciais }: { clientesIniciais: Cliente[] }) {
  const [clientes, setClientes] = useState(clientesIniciais)
  const [busca, setBusca] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleBuscar(formData: FormData) {
    const query = (formData.get('busca') as string) ?? ''
    setBusca(query)
    startTransition(async () => {
      const resultado = await listClientes(query || undefined)
      setClientes(resultado)
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    startTransition(async () => {
      await toggleClienteAtivo(id, ativo)
      const resultado = await listClientes(busca || undefined)
      setClientes(resultado)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Clientes</h1>
        <Link href="/clientes/novo" className={buttonVariants({ variant: 'default' })}>
          Novo cliente
        </Link>
      </div>
      <form action={handleBuscar} className="flex gap-2 max-w-sm">
        <Input name="busca" placeholder="Buscar por nome ou documento" defaultValue={busca} />
        <Button type="submit" variant="outline" disabled={isPending}>
          Buscar
        </Button>
      </form>
      <ClientesTable clientes={clientes} onToggleAtivo={handleToggleAtivo} />
    </div>
  )
}
```

- [ ] **Step 3: Substituir a página placeholder**

Substitua `app/(app)/clientes/page.tsx` por:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listClientes } from '@/actions/cliente-actions'
import { ClientesPageClient } from '@/components/clientes/clientes-page-client'

export default async function ClientesPage() {
  await requireModuleAccess('clientes')
  const clientes = await listClientes()

  return <ClientesPageClient clientesIniciais={clientes} />
}
```

- [ ] **Step 4: Verificar tipos e build**

```bash
npx tsc --noEmit
npm run build
```

Esperado: ambos sem erro (confirma que `buttonVariants`/`Button` estão sendo usados corretamente, sem o problema de `asChild` já visto na Fundação).

- [ ] **Step 5: Testar manualmente**

```bash
npm run dev
```

Acesse `/clientes` logado como Admin — confirme que aparece "Nenhum cliente cadastrado ainda." (lista vazia nesta fase).

- [ ] **Step 6: Commitar**

```bash
git add app/\(app\)/clientes/page.tsx components/clientes/clientes-table.tsx components/clientes/clientes-page-client.tsx
git commit -m "feat: add clientes listing page with search and ativar/inativar"
```

---

### Task 5: Formulário de criar/editar cliente

**Files:**
- Create: `components/clientes/cliente-form.tsx`, `app/(app)/clientes/novo/page.tsx`, `app/(app)/clientes/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `createCliente`/`updateCliente`/`getCliente` (Task 3), `requireModuleAccess` (Fundação).

- [ ] **Step 1: Criar o formulário compartilhado**

Crie `components/clientes/cliente-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCliente, updateCliente } from '@/actions/cliente-actions'
import type { Cliente, ClienteInput, TipoCliente } from '@/lib/types/database'

export function ClienteForm({ cliente }: { cliente?: Cliente }) {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoCliente>(cliente?.tipo ?? 'pf')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEditing = Boolean(cliente)

  function handleSubmit(formData: FormData) {
    setError(null)

    const input: ClienteInput = {
      tipo,
      documento: formData.get('documento') as string,
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
        if (isEditing && cliente) {
          await updateCliente(cliente.id, input)
        } else {
          await createCliente(input)
        }
        router.push('/clientes')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar cliente.')
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
          <Input id="documento" name="documento" defaultValue={cliente?.documento} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">{tipo === 'pf' ? 'Nome completo' : 'Razão social'}</Label>
          <Input id="nome" name="nome" defaultValue={cliente?.nome} required />
        </div>
      </div>

      {tipo === 'pj' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome_fantasia">Nome fantasia</Label>
          <Input id="nome_fantasia" name="nome_fantasia" defaultValue={cliente?.nome_fantasia ?? ''} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" name="telefone" defaultValue={cliente?.telefone ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={cliente?.email ?? ''} />
        </div>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Endereço</legend>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label htmlFor="endereco_rua">Rua</Label>
            <Input id="endereco_rua" name="endereco_rua" defaultValue={cliente?.endereco_rua ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_numero">Número</Label>
            <Input id="endereco_numero" name="endereco_numero" defaultValue={cliente?.endereco_numero ?? ''} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_bairro">Bairro</Label>
            <Input id="endereco_bairro" name="endereco_bairro" defaultValue={cliente?.endereco_bairro ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_cidade">Cidade</Label>
            <Input id="endereco_cidade" name="endereco_cidade" defaultValue={cliente?.endereco_cidade ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_uf">UF</Label>
            <Input id="endereco_uf" name="endereco_uf" maxLength={2} defaultValue={cliente?.endereco_uf ?? ''} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 max-w-xs">
          <Label htmlFor="endereco_cep">CEP</Label>
          <Input id="endereco_cep" name="endereco_cep" defaultValue={cliente?.endereco_cep ?? ''} />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <textarea
          id="observacoes"
          name="observacoes"
          defaultValue={cliente?.observacoes ?? ''}
          className="border rounded-md px-3 py-2 text-sm min-h-24"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/clientes')}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Criar a página de novo cliente**

Crie `app/(app)/clientes/novo/page.tsx`:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ClienteForm } from '@/components/clientes/cliente-form'

export default async function NovoClientePage() {
  await requireModuleAccess('clientes')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Novo cliente</h1>
      <ClienteForm />
    </div>
  )
}
```

- [ ] **Step 3: Criar a página de editar cliente**

Crie `app/(app)/clientes/[id]/editar/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getCliente } from '@/actions/cliente-actions'
import { ClienteForm } from '@/components/clientes/cliente-form'

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModuleAccess('clientes')
  const { id } = await params
  const cliente = await getCliente(id)

  if (!cliente) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Editar cliente</h1>
      <ClienteForm cliente={cliente} />
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

Esperado: `tsc`/`build` sem erro; `npm test` com todos os testes verdes exceto os já conhecidos como rate-limited em `tests/user-actions.test.ts` (limitação externa documentada na Fundação, não relacionada a este módulo).

- [ ] **Step 5: Testar manualmente o fluxo completo**

```bash
npm run dev
```

Logado como Admin:
1. Em `/clientes`, clique "Novo cliente". Cadastre um cliente PF com CPF `111.444.777-35` — confirme redirecionamento para `/clientes` e o cliente aparecendo na lista.
2. Cadastre um cliente PJ com CNPJ `11.222.333/0001-81`, incluindo nome fantasia — confirme que o campo aparece só para PJ e o cliente é salvo corretamente.
3. Tente cadastrar outro cliente com o mesmo CPF `111.444.777-35` — confirme a mensagem "Já existe um cliente cadastrado com esse documento." sem sair da tela.
4. Busque por parte do nome de um dos clientes criados — confirme que a lista filtra corretamente. Busque pelo documento — confirme que também filtra.
5. Edite um dos clientes (mude o nome) — confirme que a alteração aparece na lista.
6. Clique "Inativar" em um cliente — confirme que o status muda para "Inativo". Clique "Reativar" — confirme volta para "Ativo".
7. Apague os dois clientes de teste diretamente no Supabase Cloud (SQL Editor: `delete from clientes where documento in ('11144477735', '11222333000181');`) para não deixar dados de teste em produção.

- [ ] **Step 6: Commitar**

```bash
git add app/\(app\)/clientes/novo app/\(app\)/clientes/\[id\] components/clientes/cliente-form.tsx
git commit -m "feat: add cliente create/edit form with PF/PJ toggle"
```
