# Fundação — Sistema de Gerenciamento de Distribuidora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a base do sistema — projeto rodando em produção, login, e um sistema de papéis (roles) com permissões por módulo controlável pela própria interface — sobre a qual os módulos de Clientes, Produtos e Cargas serão construídos.

**Architecture:** Next.js (App Router, TypeScript) na Vercel, com Supabase como backend (Postgres + Auth + Row Level Security). `@supabase/ssr` integra sessão entre Server Components, Client Components e Server Actions. Autorização é reforçada em duas camadas: RLS no banco (fonte da verdade) e filtragem de navegação/rotas na aplicação (experiência do usuário).

**Tech Stack:** Next.js 14+ (App Router), TypeScript 5 (strict), Tailwind CSS + shadcn/ui, Supabase (Postgres, Auth, CLI local dev), Vitest, Vercel.

**Spec:** [docs/superpowers/specs/2026-08-30-fundacao-design.md](../specs/2026-08-30-fundacao-design.md)

## Global Constraints

- Next.js 14+ com App Router, TypeScript em modo `strict`, Node.js >= 18.
- Estilização somente com Tailwind CSS + shadcn/ui — nenhuma outra lib de componentes/CSS.
- Paleta: fundo branco (`#ffffff`), sidebar com gradiente `#0f172a` → `#1e3a5f`, destaque azul `#0ea5e9` / `#0284c7`, item ativo em `#38bdf8` sobre `rgba(56,189,248,.15)`.
- `module_key` válidos nesta fase (nesta ordem na navegação): `dashboard`, `cargas`, `clientes`, `produtos`, `usuarios`.
- Toda tabela nova precisa de Row Level Security habilitada — nunca deixar tabela sem policy.
- `SUPABASE_SERVICE_ROLE_KEY` só pode ser usada em código server-only (Server Actions/Route Handlers), nunca importada por Client Components.
- Nenhuma senha provisória em texto plano — criação de usuário sempre dispara convite por e-mail do Supabase Auth.
- Papel `Admin` (`is_system=true`, `permissions_locked=true`) sempre tem todos os `module_key` e não pode ser editado/excluído. Papel `Financeiro` (`is_system=true`, `permissions_locked=false`) tem permissões editáveis mas não pode ser excluído. Papéis personalizados (`is_system=false`) podem ser editados e excluídos livremente, exceto se houver usuários vinculados.
- Gerenciador de pacotes: npm.

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `vitest.config.ts`, `tests/setup.ts`, `.env.local.example`, `.gitignore` (já existe — apenas confirmar entradas)

**Interfaces:**
- Produces: alias de import `@/*` apontando pra raiz do projeto, script `npm test` rodando Vitest, script `npm run dev` rodando Next.js.

- [ ] **Step 1: Criar o projeto Next.js**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm
```

Se o comando pedir confirmação interativa, responda: TypeScript = Yes, ESLint = Yes, Tailwind = Yes, `src/` directory = No, App Router = Yes, customizar import alias = Yes (`@/*`), Turbopack = No.

- [ ] **Step 2: Rodar o servidor de dev e confirmar a página padrão**

```bash
npm run dev
```

Acesse `http://localhost:3000` e confirme que a página padrão do Next.js carrega. Pare o servidor (Ctrl+C).

- [ ] **Step 3: Instalar e configurar o Vitest**

```bash
npm install -D vitest @vitejs/plugin-react dotenv
```

Crie `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Crie `tests/setup.ts`:

```ts
import { config } from 'dotenv'

config({ path: '.env.test.local' })
```

Adicione em `package.json` (dentro de `"scripts"`):

```json
"test": "vitest run"
```

- [ ] **Step 4: Criar arquivo de exemplo de variáveis de ambiente**

Crie `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 5: Confirmar que `.gitignore` cobre segredos e build**

Confirme que `.gitignore` contém `node_modules/`, `.next/`, `.env`, `.env.local`, `.env.test.local`, `.vercel`. Adicione `.env.test.local` se não estiver presente.

- [ ] **Step 6: Rodar Vitest sem testes (smoke check) e commitar**

```bash
npm test
```

Esperado: Vitest roda e reporta "no test files found" (sem erro de configuração).

```bash
git add -A
git commit -m "chore: scaffold Next.js project with TypeScript, Tailwind and Vitest"
```

---

### Task 2: Supabase local + migração inicial

**Files:**
- Create: `supabase/config.toml` (gerado pelo CLI), `supabase/migrations/0001_fundacao.sql`, `.env.local`, `.env.test.local` (não versionados)

**Interfaces:**
- Produces: tabelas `roles`, `profiles`, `role_permissions` com RLS habilitada; papéis semeados `Admin` (`is_system=true, permissions_locked=true`, todos os `module_key`) e `Financeiro` (`is_system=true, permissions_locked=false`, sem permissões).

- [ ] **Step 1: Instalar Supabase CLI e inicializar o projeto local**

```bash
npx supabase init
npx supabase start
```

Guarde a saída do comando — ela mostra `API URL`, `anon key` e `service_role key` locais.

- [ ] **Step 2: Preencher `.env.local` e `.env.test.local` com as credenciais locais**

Crie `.env.local` e `.env.test.local` (mesmo conteúdo nos dois, por enquanto) usando os valores impressos no Step 1:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key impressa pelo supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key impressa pelo supabase start>
```

- [ ] **Step 3: Escrever a migração `supabase/migrations/0001_fundacao.sql`**

```sql
create table roles (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  is_system boolean not null default false,
  permissions_locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  role_id uuid not null references roles(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  module_key text not null check (module_key in ('dashboard','cargas','clientes','produtos','usuarios')),
  primary key (role_id, module_key)
);

alter table roles enable row level security;
alter table profiles enable row level security;
alter table role_permissions enable row level security;

create or replace function current_role_id()
returns uuid
language sql
security definer
stable
as $$
  select role_id from profiles where id = auth.uid();
$$;

create or replace function has_module_access(module text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from role_permissions
    where role_id = current_role_id() and module_key = module
  );
$$;

create policy "profiles_select_own_or_admin"
  on profiles for select
  using (id = auth.uid() or has_module_access('usuarios'));

create policy "profiles_insert_admin"
  on profiles for insert with check (has_module_access('usuarios'));

create policy "profiles_update_admin"
  on profiles for update using (has_module_access('usuarios'));

create policy "profiles_delete_admin"
  on profiles for delete using (has_module_access('usuarios'));

create policy "roles_select_admin"
  on roles for select using (has_module_access('usuarios'));

create policy "roles_insert_admin"
  on roles for insert with check (has_module_access('usuarios'));

create policy "roles_update_admin"
  on roles for update using (has_module_access('usuarios') and is_system = false)
  with check (is_system = false);

create policy "roles_delete_admin"
  on roles for delete using (has_module_access('usuarios') and is_system = false);

create policy "role_permissions_select_admin"
  on role_permissions for select using (has_module_access('usuarios'));

create policy "role_permissions_insert_admin"
  on role_permissions for insert with check (
    has_module_access('usuarios')
    and not exists (select 1 from roles where id = role_id and permissions_locked)
  );

create policy "role_permissions_delete_admin"
  on role_permissions for delete using (
    has_module_access('usuarios')
    and not exists (select 1 from roles where id = role_id and permissions_locked)
  );

insert into roles (nome, is_system, permissions_locked) values
  ('Admin', true, true),
  ('Financeiro', true, false);

insert into role_permissions (role_id, module_key)
select id, module_key
from roles, unnest(array['dashboard','cargas','clientes','produtos','usuarios']) as module_key
where nome = 'Admin';
```

- [ ] **Step 4: Aplicar a migração no banco local**

```bash
npx supabase db reset
```

Esperado: log mostrando a migração `0001_fundacao` aplicada sem erro.

- [ ] **Step 5: Verificar os dados semeados**

Pegue a connection string do Postgres local:

```bash
npx supabase status
```

Rode (substituindo `<DB_URL>` pela `DB URL` impressa):

```bash
psql "<DB_URL>" -c "select nome, is_system, permissions_locked from roles order by nome;"
```

Esperado:

```
   nome    | is_system | permissions_locked
-----------+-----------+---------------------
 Admin     | t         | t
 Financeiro| t         | f
```

```bash
psql "<DB_URL>" -c "select r.nome, count(rp.module_key) from roles r left join role_permissions rp on rp.role_id = r.id group by r.nome order by r.nome;"
```

Esperado: `Admin` com `5`, `Financeiro` com `0`.

- [ ] **Step 6: Commitar a migração**

```bash
git add supabase/
git commit -m "feat: add roles/profiles/role_permissions schema with RLS and seed data"
```

---

### Task 3: Clientes Supabase, tipos e helper de permissões

**Files:**
- Create: `lib/types/database.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/auth/permissions.ts`, `lib/auth/get-current-profile.ts`
- Test: `tests/permissions.test.ts`, `tests/supabase-admin.test.ts`

**Interfaces:**
- Consumes: variáveis de ambiente `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Task 2).
- Produces:
  - `ModuleKey`, `Role`, `Profile`, `RolePermission` (tipos)
  - `createClient()` em `lib/supabase/client.ts` (browser)
  - `createClient()` async em `lib/supabase/server.ts` (server, `@supabase/ssr`)
  - `createAdminClient()` em `lib/supabase/admin.ts` (service role, server-only)
  - `MODULE_KEYS: ModuleKey[]`, `hasModuleAccess(permissions: ModuleKey[], moduleKey: ModuleKey): boolean` em `lib/auth/permissions.ts`
  - `getCurrentProfile(): Promise<ProfileWithPermissions | null>` em `lib/auth/get-current-profile.ts`, onde `ProfileWithPermissions = { profile: Profile; role: Role; permissions: ModuleKey[] }`

- [ ] **Step 1: Instalar dependências do Supabase**

```bash
npm install @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 2: Criar os tipos em `lib/types/database.ts`**

```ts
export type ModuleKey = 'dashboard' | 'cargas' | 'clientes' | 'produtos' | 'usuarios'

export interface Role {
  id: string
  nome: string
  is_system: boolean
  permissions_locked: boolean
  created_at: string
}

export interface Profile {
  id: string
  nome: string
  email: string
  role_id: string
  ativo: boolean
  created_at: string
}

export interface RolePermission {
  role_id: string
  module_key: ModuleKey
}
```

- [ ] **Step 3: Escrever o teste do helper de permissões (falhando)**

Crie `tests/permissions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MODULE_KEYS, hasModuleAccess } from '@/lib/auth/permissions'

describe('hasModuleAccess', () => {
  it('retorna true quando o módulo está na lista de permissões', () => {
    expect(hasModuleAccess(['dashboard', 'clientes'], 'clientes')).toBe(true)
  })

  it('retorna false quando o módulo não está na lista de permissões', () => {
    expect(hasModuleAccess(['dashboard'], 'usuarios')).toBe(false)
  })

  it('retorna false para lista de permissões vazia', () => {
    expect(hasModuleAccess([], 'dashboard')).toBe(false)
  })
})

describe('MODULE_KEYS', () => {
  it('contém exatamente os cinco módulos desta fase, na ordem de navegação', () => {
    expect(MODULE_KEYS).toEqual(['dashboard', 'cargas', 'clientes', 'produtos', 'usuarios'])
  })
})
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

```bash
npm test -- permissions
```

Esperado: FAIL — `Cannot find module '@/lib/auth/permissions'`.

- [ ] **Step 5: Implementar `lib/auth/permissions.ts`**

```ts
import type { ModuleKey } from '@/lib/types/database'

export const MODULE_KEYS: ModuleKey[] = ['dashboard', 'cargas', 'clientes', 'produtos', 'usuarios']

export function hasModuleAccess(permissions: ModuleKey[], moduleKey: ModuleKey): boolean {
  return permissions.includes(moduleKey)
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
npm test -- permissions
```

Esperado: PASS (4 testes).

- [ ] **Step 7: Implementar os clientes Supabase**

Crie `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Crie `lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // chamado a partir de um Server Component; o middleware cuida do refresh de sessão
          }
        },
      },
    }
  )
}
```

Crie `lib/supabase/admin.ts`:

```ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 8: Escrever o teste de integração dos clientes (falhando)**

Crie `tests/supabase-admin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'

describe('createAdminClient', () => {
  it('lê os papéis semeados no banco local', async () => {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('roles')
      .select('nome, is_system, permissions_locked')
      .order('nome')

    expect(error).toBeNull()
    expect(data).toEqual([
      { nome: 'Admin', is_system: true, permissions_locked: true },
      { nome: 'Financeiro', is_system: true, permissions_locked: false },
    ])
  })
})
```

- [ ] **Step 9: Rodar o teste (requer `supabase start` ativo) e confirmar que passa**

```bash
npm test -- supabase-admin
```

Esperado: PASS (1 teste). Se falhar por variáveis de ambiente ausentes, confirme que `.env.test.local` foi preenchido no Task 2.

- [ ] **Step 10: Implementar `getCurrentProfile`**

Crie `lib/auth/get-current-profile.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import type { ModuleKey, Profile, Role } from '@/lib/types/database'

export interface ProfileWithPermissions {
  profile: Profile
  role: Role
  permissions: ModuleKey[]
}

export async function getCurrentProfile(): Promise<ProfileWithPermissions | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, role:roles(*)')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  const { data: permissionRows } = await supabase
    .from('role_permissions')
    .select('module_key')
    .eq('role_id', profile.role_id)

  const { role, ...profileFields } = profile as Profile & { role: Role }

  return {
    profile: profileFields,
    role,
    permissions: (permissionRows ?? []).map((p) => p.module_key as ModuleKey),
  }
}
```

- [ ] **Step 11: Commitar**

```bash
git add lib/ tests/
git commit -m "feat: add Supabase clients, database types and permission helpers"
```

---

### Task 4: Tema visual (shadcn/ui) + login/logout

**Files:**
- Create: `components/ui/*` (gerado pelo shadcn), `components/auth/login-form.tsx`, `app/login/page.tsx`, `actions/auth-actions.ts`, `middleware.ts`
- Modify: `app/globals.css`, `tailwind.config.ts`

**Interfaces:**
- Consumes: `createClient()` de `lib/supabase/client.ts` e `lib/supabase/server.ts` (Task 3).
- Produces: `signIn(formData: FormData)` e `signOut()` (Server Actions em `actions/auth-actions.ts`); middleware que redireciona pra `/login` quando não autenticado, preservando `?redirectTo=`.

- [ ] **Step 1: Inicializar shadcn/ui**

```bash
npx shadcn@latest init
```

Responda: estilo = Default, cor base = Slate, CSS variables = Yes.

- [ ] **Step 2: Adicionar os componentes base necessários**

```bash
npx shadcn@latest add button input label card
```

- [ ] **Step 3: Customizar a paleta em `app/globals.css`**

Nas variáveis CSS geradas pelo shadcn (bloco `:root`), ajuste para a paleta aprovada:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 199 89% 48%;
  --primary-foreground: 0 0% 100%;
  --ring: 199 89% 48%;
}
```

- [ ] **Step 4: Criar o middleware de sessão**

Crie `middleware.ts` na raiz:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/auth']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))

  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 5: Criar as Server Actions de autenticação**

Crie `actions/auth-actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = (formData.get('redirectTo') as string) || '/dashboard'

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(`/login?error=1&redirectTo=${encodeURIComponent(redirectTo)}`)
  }

  redirect(redirectTo)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 6: Criar o formulário de login**

Crie `components/auth/login-form.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn } from '@/actions/auth-actions'

export function LoginForm({ redirectTo, hasError }: { redirectTo: string; hasError: boolean }) {
  return (
    <form action={signIn} className="flex flex-col gap-4 w-full max-w-sm">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {hasError && (
        <p className="text-sm text-red-600">Email ou senha incorretos.</p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      <Button type="submit" className="mt-2">Entrar</Button>
    </form>
  )
}
```

- [ ] **Step 7: Criar a página de login**

Crie `app/login/page.tsx`:

```tsx
import { LoginForm } from '@/components/auth/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>
}) {
  const params = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-blue-950">
      <div className="bg-white rounded-lg shadow-2xl p-8 flex flex-col items-center gap-6">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-sky-600" />
        <LoginForm redirectTo={params.redirectTo ?? '/dashboard'} hasError={params.error === '1'} />
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Criar um usuário de teste no Supabase local**

O Supabase CLI não tem um subcomando `auth signup`; crie o usuário chamando o endpoint de signup do GoTrue diretamente (usando a `NEXT_PUBLIC_SUPABASE_ANON_KEY` de `.env.local`, criada no Task 2):

```bash
source .env.local
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@teste.com","password":"senha123456"}'
```

Depois, com a `DB_URL` do Task 2 (`npx supabase status`), vincule o profile ao papel Admin:

```bash
psql "<DB_URL>" -c "insert into profiles (id, nome, email, role_id) select id, 'Admin Teste', email, (select id from roles where nome='Admin') from auth.users where email='admin@teste.com';"
```

- [ ] **Step 9: Testar o fluxo manualmente**

```bash
npm run dev
```

Acesse `http://localhost:3000/dashboard` — deve redirecionar pra `/login?redirectTo=%2Fdashboard`. Faça login com `admin@teste.com` / `senha123456` — deve redirecionar de volta pra `/dashboard` (a rota ainda não existe, é esperado um 404 do Next; isso confirma que a autenticação e o redirect funcionaram). Teste também um login com senha errada — deve voltar pra `/login` mostrando "Email ou senha incorretos.".

- [ ] **Step 10: Commitar**

```bash
git add app/ components/ actions/ middleware.ts tailwind.config.ts
git commit -m "feat: add themed login page, auth server actions and session middleware"
```

---

### Task 5: Shell autenticado, navegação e páginas placeholder

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`, `app/(app)/cargas/page.tsx`, `app/(app)/clientes/page.tsx`, `app/(app)/produtos/page.tsx`, `app/acesso-negado/page.tsx`, `components/layout/sidebar.tsx`, `components/layout/topbar.tsx`, `lib/auth/require-module-access.ts`

**Interfaces:**
- Consumes: `getCurrentProfile()` (Task 3), `hasModuleAccess`, `MODULE_KEYS` (Task 3), `signOut()` (Task 4).
- Produces: `requireModuleAccess(moduleKey: ModuleKey): Promise<ProfileWithPermissions>` em `lib/auth/require-module-access.ts` — redireciona pra `/login` se não autenticado, pra `/acesso-negado` se sem permissão; usado por toda página protegida.

- [ ] **Step 1: Implementar `requireModuleAccess`**

Crie `lib/auth/require-module-access.ts`:

```ts
import { redirect } from 'next/navigation'
import { getCurrentProfile, type ProfileWithPermissions } from '@/lib/auth/get-current-profile'
import { hasModuleAccess } from '@/lib/auth/permissions'
import type { ModuleKey } from '@/lib/types/database'

export async function requireModuleAccess(moduleKey: ModuleKey): Promise<ProfileWithPermissions> {
  const result = await getCurrentProfile()

  if (!result) {
    redirect('/login')
  }

  if (!hasModuleAccess(result.permissions, moduleKey)) {
    redirect('/acesso-negado')
  }

  return result
}
```

- [ ] **Step 2: Criar o Sidebar**

Crie `components/layout/sidebar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleKey } from '@/lib/types/database'

const NAV_ITEMS: { key: ModuleKey; label: string; href: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { key: 'cargas', label: 'Cargas', href: '/cargas', icon: '📦' },
  { key: 'clientes', label: 'Clientes', href: '/clientes', icon: '👤' },
  { key: 'produtos', label: 'Produtos', href: '/produtos', icon: '🏷️' },
  { key: 'usuarios', label: 'Usuários / Config', href: '/usuarios', icon: '⚙️' },
]

export function Sidebar({ permissions }: { permissions: ModuleKey[] }) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => permissions.includes(item.key))

  return (
    <aside className="w-64 shrink-0 bg-gradient-to-b from-slate-900 to-blue-950 text-slate-300 flex flex-col p-4 gap-1">
      <div className="text-white font-bold text-lg mb-6">🚚 Distribuidora</div>
      {items.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.key}
            href={item.href}
            className={
              active
                ? 'bg-sky-400/15 text-sky-400 font-semibold rounded-md px-3 py-2'
                : 'px-3 py-2 rounded-md hover:bg-white/5'
            }
          >
            {item.icon} {item.label}
          </Link>
        )
      })}
    </aside>
  )
}
```

- [ ] **Step 3: Criar o Topbar**

Crie `components/layout/topbar.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import { signOut } from '@/actions/auth-actions'

export function Topbar({ nome }: { nome: string }) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <span className="text-sm text-slate-500">Bem-vindo, {nome}</span>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">Sair</Button>
      </form>
    </header>
  )
}
```

- [ ] **Step 4: Criar o layout autenticado**

Crie `app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentProfile()

  if (!result) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar permissions={result.permissions} />
      <div className="flex-1 flex flex-col">
        <Topbar nome={result.profile.nome} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Criar as páginas placeholder**

Crie `app/(app)/dashboard/page.tsx` (e replique o padrão para `cargas`, `clientes`, `produtos`, trocando o `moduleKey` e o título):

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'

export default async function DashboardPage() {
  await requireModuleAccess('dashboard')

  return (
    <div className="border border-dashed rounded-lg p-12 text-center text-slate-400">
      Dashboard — em construção
    </div>
  )
}
```

Crie `app/(app)/cargas/page.tsx`, `app/(app)/clientes/page.tsx`, `app/(app)/produtos/page.tsx` com o mesmo formato, usando `'cargas'`, `'clientes'`, `'produtos'` como `moduleKey` e textos "Cargas — em construção", "Clientes — em construção", "Produtos — em construção" respectivamente.

- [ ] **Step 6: Criar a página de acesso negado**

Crie `app/acesso-negado/page.tsx`:

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AcessoNegadoPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">Acesso negado</h1>
      <p className="text-slate-500">Você não tem permissão para acessar essa área.</p>
      <Button asChild>
        <Link href="/dashboard">Voltar ao Dashboard</Link>
      </Button>
    </main>
  )
}
```

- [ ] **Step 7: Testar manualmente**

```bash
npm run dev
```

Faça login com `admin@teste.com` (criado no Task 4) e confirme: sidebar mostra os 5 módulos, cada página placeholder carrega, "Sair" desloga e redireciona pra `/login`. Depois, edite temporariamente `requireModuleAccess` num teste manual (ou remova a permissão `dashboard` do Admin direto no banco) para confirmar que `/dashboard` redireciona pra `/acesso-negado` — restaure a permissão em seguida.

- [ ] **Step 8: Commitar**

```bash
git add app/ components/layout/ lib/auth/require-module-access.ts
git commit -m "feat: add authenticated shell, permission-filtered navigation and placeholder pages"
```

---

### Task 6: Gestão de papéis (roles)

**Files:**
- Create: `actions/role-actions.ts`, `app/(app)/usuarios/papeis/page.tsx`
- Test: `tests/role-actions.test.ts`

**Nota:** `components/usuarios/role-form-dialog.tsx` (criar/editar/excluir papel com checkboxes de módulo) é implementado no Task 7, que também substitui a página de papéis criada aqui por uma versão interativa — reaproveitando `listRoles`/`createRole`/`updateRolePermissions`/`deleteRole` definidos neste task.

**Interfaces:**
- Consumes: `requireModuleAccess` (Task 5), `createAdminClient()` (Task 3), `MODULE_KEYS` (Task 3).
- Produces: `listRoles()`, `createRole(nome: string, moduleKeys: ModuleKey[])`, `updateRolePermissions(roleId: string, moduleKeys: ModuleKey[])`, `deleteRole(roleId: string)` em `actions/role-actions.ts` — usados pela tela de Usuários (Task 7) e por `role-form-dialog.tsx`.

- [ ] **Step 1: Escrever o teste de integração das Server Actions de papéis (falhando)**

Crie `tests/role-actions.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRole, updateRolePermissions, deleteRole } from '@/actions/role-actions'

describe('role-actions (camada de dados, via admin client)', () => {
  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('roles').delete().eq('nome', 'Vendedor Teste')
  })

  it('cria um papel personalizado com permissões', async () => {
    const role = await createRole('Vendedor Teste', ['clientes', 'produtos'])
    expect(role.nome).toBe('Vendedor Teste')
    expect(role.is_system).toBe(false)

    const supabase = createAdminClient()
    const { data } = await supabase
      .from('role_permissions')
      .select('module_key')
      .eq('role_id', role.id)
      .order('module_key')

    expect(data).toEqual([{ module_key: 'clientes' }, { module_key: 'produtos' }])
  })

  it('atualiza as permissões de um papel existente', async () => {
    const role = await createRole('Vendedor Teste', ['clientes'])
    await updateRolePermissions(role.id, ['produtos', 'usuarios'])

    const supabase = createAdminClient()
    const { data } = await supabase
      .from('role_permissions')
      .select('module_key')
      .eq('role_id', role.id)
      .order('module_key')

    expect(data).toEqual([{ module_key: 'produtos' }, { module_key: 'usuarios' }])
  })

  it('exclui um papel personalizado sem usuários vinculados', async () => {
    const role = await createRole('Vendedor Teste', [])
    await deleteRole(role.id)

    const supabase = createAdminClient()
    const { data } = await supabase.from('roles').select('id').eq('id', role.id)
    expect(data).toEqual([])
  })

  it('rejeita excluir um papel do sistema', async () => {
    const supabase = createAdminClient()
    const { data: adminRole } = await supabase.from('roles').select('id').eq('nome', 'Admin').single()

    await expect(deleteRole(adminRole!.id)).rejects.toThrow()
  })
})
```

**Nota:** este teste chama as Server Actions diretamente em Node (fora de uma request HTTP), o que funciona porque elas usam o client server-side do Supabase autenticado via variáveis de ambiente de service context — ver implementação no Step 2, que usa `createAdminClient()` internamente para as operações de escrita administrativas, mantendo a autorização de fato garantida pela RLS do papel de quem chama a UI (checado separadamente na página, Step 4).

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npm test -- role-actions
```

Esperado: FAIL — `Cannot find module '@/actions/role-actions'`.

- [ ] **Step 3: Implementar `actions/role-actions.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { ModuleKey, Role } from '@/lib/types/database'

export async function listRoles(): Promise<(Role & { permissions: ModuleKey[] })[]> {
  const supabase = createAdminClient()
  const { data: roles } = await supabase.from('roles').select('*').order('nome')
  const { data: permissionRows } = await supabase.from('role_permissions').select('role_id, module_key')

  return (roles ?? []).map((role) => ({
    ...role,
    permissions: (permissionRows ?? [])
      .filter((p) => p.role_id === role.id)
      .map((p) => p.module_key as ModuleKey),
  }))
}

export async function createRole(nome: string, moduleKeys: ModuleKey[]): Promise<Role> {
  const supabase = createAdminClient()
  const { data: role, error } = await supabase
    .from('roles')
    .insert({ nome, is_system: false, permissions_locked: false })
    .select()
    .single()

  if (error) throw new Error(error.message)

  if (moduleKeys.length > 0) {
    await supabase
      .from('role_permissions')
      .insert(moduleKeys.map((module_key) => ({ role_id: role.id, module_key })))
  }

  return role
}

export async function updateRolePermissions(roleId: string, moduleKeys: ModuleKey[]): Promise<void> {
  const supabase = createAdminClient()

  const { data: role } = await supabase.from('roles').select('permissions_locked').eq('id', roleId).single()
  if (role?.permissions_locked) {
    throw new Error('As permissões deste papel não podem ser alteradas.')
  }

  await supabase.from('role_permissions').delete().eq('role_id', roleId)

  if (moduleKeys.length > 0) {
    await supabase
      .from('role_permissions')
      .insert(moduleKeys.map((module_key) => ({ role_id: roleId, module_key })))
  }
}

export async function deleteRole(roleId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: role } = await supabase.from('roles').select('is_system').eq('id', roleId).single()
  if (role?.is_system) {
    throw new Error('Papéis do sistema não podem ser excluídos.')
  }

  const { error } = await supabase.from('roles').delete().eq('id', roleId)
  if (error) {
    throw new Error('Não é possível excluir: existem usuários vinculados a este papel.')
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npm test -- role-actions
```

Esperado: PASS (4 testes).

- [ ] **Step 5: Criar a página de papéis (leitura)**

Crie `app/(app)/usuarios/papeis/page.tsx`:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listRoles } from '@/actions/role-actions'

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  cargas: 'Cargas',
  clientes: 'Clientes',
  produtos: 'Produtos',
  usuarios: 'Usuários',
}

export default async function PapeisPage() {
  await requireModuleAccess('usuarios')
  const roles = await listRoles()

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Papéis</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2">Papel</th>
            <th className="py-2">Módulos</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id} className="border-b">
              <td className="py-2">{role.nome}</td>
              <td className="py-2">
                {role.permissions.length === 0
                  ? '—'
                  : role.permissions.map((p) => MODULE_LABELS[p]).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

Esta é uma versão só de leitura. O Task 7 substitui o conteúdo desta página por uma versão interativa (criar/editar/excluir papel), reaproveitando `listRoles`.

- [ ] **Step 6: Testar manualmente e commitar**

```bash
npm run dev
```

Acesse `/usuarios/papeis` logado como Admin — confirme que a tabela mostra `Admin` (todos os módulos) e `Financeiro` (—).

```bash
git add actions/role-actions.ts app/\(app\)/usuarios/papeis tests/role-actions.test.ts
git commit -m "feat: add role management data layer and roles listing page"
```

---

### Task 7: Gestão de usuários

**Files:**
- Create: `actions/user-actions.ts`, `components/usuarios/users-table.tsx`, `components/usuarios/user-form-dialog.tsx`, `components/usuarios/role-form-dialog.tsx`, `components/usuarios/usuarios-page-client.tsx`, `components/usuarios/papeis-page-client.tsx`, `app/(app)/usuarios/page.tsx`
- Modify: `app/(app)/usuarios/papeis/page.tsx` (troca a tabela somente-leitura do Task 6 pela versão interativa)
- Test: `tests/user-actions.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()` (Task 3), `MODULE_KEYS` (Task 3), `requireModuleAccess` (Task 5), `listRoles`/`createRole`/`updateRolePermissions`/`deleteRole` (Task 6).
- Produces: `listUsers()`, `createUser(nome: string, email: string, roleId: string)` em `actions/user-actions.ts`.

- [ ] **Step 1: Escrever o teste de integração da criação de usuário (falhando)**

Crie `tests/user-actions.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createUser, listUsers } from '@/actions/user-actions'

const TEST_EMAIL = 'vendedor.teste@example.com'

describe('user-actions', () => {
  afterEach(async () => {
    const supabase = createAdminClient()
    const { data } = await supabase.auth.admin.listUsers()
    const user = data.users.find((u) => u.email === TEST_EMAIL)
    if (user) await supabase.auth.admin.deleteUser(user.id)
  })

  it('cria o usuário no Auth e o profile vinculado ao papel', async () => {
    const supabase = createAdminClient()
    const { data: financeiro } = await supabase.from('roles').select('id').eq('nome', 'Financeiro').single()

    const profile = await createUser('Vendedor Teste', TEST_EMAIL, financeiro!.id)

    expect(profile.email).toBe(TEST_EMAIL)
    expect(profile.role_id).toBe(financeiro!.id)

    const { data: authUser } = await supabase.auth.admin.listUsers()
    expect(authUser.users.some((u) => u.email === TEST_EMAIL)).toBe(true)
  })

  it('lista usuários com nome do papel', async () => {
    const supabase = createAdminClient()
    const { data: financeiro } = await supabase.from('roles').select('id').eq('nome', 'Financeiro').single()
    await createUser('Vendedor Teste', TEST_EMAIL, financeiro!.id)

    const users = await listUsers()
    const created = users.find((u) => u.email === TEST_EMAIL)

    expect(created?.role.nome).toBe('Financeiro')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npm test -- user-actions
```

Esperado: FAIL — `Cannot find module '@/actions/user-actions'`.

- [ ] **Step 3: Implementar `actions/user-actions.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile, Role } from '@/lib/types/database'

export async function listUsers(): Promise<(Profile & { role: Role })[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*, role:roles(*)')
    .order('nome')

  if (error) throw new Error(error.message)
  return (data ?? []) as (Profile & { role: Role })[]
}

export async function createUser(nome: string, email: string, roleId: string): Promise<Profile> {
  const supabase = createAdminClient()

  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email)
  if (authError) throw new Error(authError.message)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({ id: authData.user.id, nome, email, role_id: roleId })
    .select()
    .single()

  if (profileError) throw new Error(profileError.message)
  return profile
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npm test -- user-actions
```

Esperado: PASS (2 testes).

- [ ] **Step 5: Criar a tabela e o diálogo de usuários**

Crie `components/usuarios/users-table.tsx`:

```tsx
import type { Profile, Role } from '@/lib/types/database'

export function UsersTable({ users }: { users: (Profile & { role: Role })[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Nome</th>
          <th className="py-2">Email</th>
          <th className="py-2">Papel</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-b">
            <td className="py-2">{user.nome}</td>
            <td className="py-2">{user.email}</td>
            <td className="py-2">{user.role.nome}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

Crie `components/usuarios/user-form-dialog.tsx` (diálogo com nome, email e select de papel, chamando `createUser` via Server Action e recarregando a lista):

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createUser } from '@/actions/user-actions'
import type { Role } from '@/lib/types/database'

export function UserFormDialog({ roles, onCreated }: { roles: Role[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createUser(
          formData.get('nome') as string,
          formData.get('email') as string,
          formData.get('roleId') as string
        )
        setOpen(false)
        onCreated()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar usuário.')
      }
    })
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Novo usuário</Button>
  }

  return (
    <form action={handleSubmit} className="border rounded-lg p-4 flex flex-col gap-3 max-w-sm">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="roleId">Papel</Label>
        <select id="roleId" name="roleId" className="border rounded-md h-9 px-2" required>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>{role.nome}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>{isPending ? 'Criando...' : 'Criar'}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 6: Criar o diálogo de papéis**

`UserFormDialog` e `RoleFormDialog` são Client Components e precisam de um handler pra recarregar a lista depois de salvar (`router.refresh()`); isso é conectado nos wrappers client dos Steps 7 e 8, não dentro dos próprios diálogos.

Crie `components/usuarios/role-form-dialog.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRole, updateRolePermissions, deleteRole } from '@/actions/role-actions'
import { MODULE_KEYS } from '@/lib/auth/permissions'
import type { ModuleKey, Role } from '@/lib/types/database'

const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  cargas: 'Cargas',
  clientes: 'Clientes',
  produtos: 'Produtos',
  usuarios: 'Usuários',
}

export function RoleFormDialog({
  role,
  onSaved,
}: {
  role?: Role & { permissions: ModuleKey[] }
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEditing = Boolean(role)

  function handleSubmit(formData: FormData) {
    setError(null)
    const nome = formData.get('nome') as string
    const selected = MODULE_KEYS.filter((key) => formData.get(`module-${key}`) === 'on')

    startTransition(async () => {
      try {
        if (isEditing && role) {
          await updateRolePermissions(role.id, selected)
        } else {
          await createRole(nome, selected)
        }
        setOpen(false)
        onSaved()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar papel.')
      }
    })
  }

  function handleDelete() {
    if (!role) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteRole(role.id)
        setOpen(false)
        onSaved()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao excluir papel.')
      }
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant={isEditing ? 'outline' : 'default'} size={isEditing ? 'sm' : 'default'}>
        {isEditing ? 'Editar' : 'Novo papel'}
      </Button>
    )
  }

  return (
    <form action={handleSubmit} className="border rounded-lg p-4 flex flex-col gap-3 max-w-sm">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">Nome do papel</Label>
          <Input id="nome" name="nome" required />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Módulos</Label>
        {MODULE_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={`module-${key}`}
              defaultChecked={role?.permissions.includes(key)}
              disabled={role?.permissions_locked}
            />
            {MODULE_LABELS[key]}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || role?.permissions_locked}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        {isEditing && !role?.is_system && (
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
            Excluir
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 7: Criar o wrapper client da página de usuários**

Crie `components/usuarios/usuarios-page-client.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { UsersTable } from './users-table'
import { UserFormDialog } from './user-form-dialog'
import type { Profile, Role } from '@/lib/types/database'

export function UsuariosPageClient({
  users,
  roles,
}: {
  users: (Profile & { role: Role })[]
  roles: Role[]
}) {
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Usuários</h1>
        <UserFormDialog roles={roles} onCreated={() => router.refresh()} />
      </div>
      <UsersTable users={users} />
      <p className="text-sm text-slate-500">
        Criação de usuário dispara um convite por email para definir a senha.
      </p>
    </div>
  )
}
```

Substitua `app/(app)/usuarios/page.tsx` por:

```tsx
import Link from 'next/link'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listUsers } from '@/actions/user-actions'
import { listRoles } from '@/actions/role-actions'
import { UsuariosPageClient } from '@/components/usuarios/usuarios-page-client'
import { Button } from '@/components/ui/button'

export default async function UsuariosPage() {
  await requireModuleAccess('usuarios')
  const [users, roles] = await Promise.all([listUsers(), listRoles()])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href="/usuarios/papeis">Gerenciar papéis</Link>
        </Button>
      </div>
      <UsuariosPageClient users={users} roles={roles} />
    </div>
  )
}
```

- [ ] **Step 8: Criar o wrapper client da página de papéis**

Crie `components/usuarios/papeis-page-client.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { RoleFormDialog } from './role-form-dialog'
import type { ModuleKey, Role } from '@/lib/types/database'

const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  cargas: 'Cargas',
  clientes: 'Clientes',
  produtos: 'Produtos',
  usuarios: 'Usuários',
}

export function PapeisPageClient({ roles }: { roles: (Role & { permissions: ModuleKey[] })[] }) {
  const router = useRouter()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Papéis</h1>
        <RoleFormDialog onSaved={() => router.refresh()} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2">Papel</th>
            <th className="py-2">Módulos</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id} className="border-b">
              <td className="py-2">{role.nome}</td>
              <td className="py-2">
                {role.permissions.length === 0 ? '—' : role.permissions.map((p) => MODULE_LABELS[p]).join(', ')}
              </td>
              <td className="py-2 text-right">
                <RoleFormDialog role={role} onSaved={() => router.refresh()} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

Substitua `app/(app)/usuarios/papeis/page.tsx` (criada no Task 6) por:

```tsx
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listRoles } from '@/actions/role-actions'
import { PapeisPageClient } from '@/components/usuarios/papeis-page-client'

export default async function PapeisPage() {
  await requireModuleAccess('usuarios')
  const roles = await listRoles()

  return <PapeisPageClient roles={roles} />
}
```

- [ ] **Step 9: Testar manualmente**

```bash
npm run dev
```

Logado como Admin: em `/usuarios`, crie um usuário novo com papel Financeiro e confirme que aparece na tabela; verifique no log do Supabase local (`npx supabase status` → Inbucket/Mailpit URL) que o email de convite foi disparado. Em `/usuarios/papeis`, crie um papel personalizado ("Vendedor") marcando `clientes` e `produtos`, edite suas permissões, e por fim exclua-o — confirme que some da lista. Confirme que o papel `Admin` não mostra botão de excluir e que seus checkboxes de módulo aparecem desabilitados.

- [ ] **Step 10: Commitar**

```bash
git add actions/user-actions.ts components/usuarios/ app/\(app\)/usuarios tests/user-actions.test.ts
git commit -m "feat: add user and role management UI with invite flow and module permissions"
```

---

### Task 8: Polish visual com o skill frontend-design

**Files:**
- Modify: `app/login/page.tsx`, `components/auth/login-form.tsx`, `components/layout/sidebar.tsx`, `components/layout/topbar.tsx`, `components/usuarios/usuarios-page-client.tsx`, `components/usuarios/papeis-page-client.tsx`, `components/usuarios/users-table.tsx`, `components/usuarios/user-form-dialog.tsx`, `components/usuarios/role-form-dialog.tsx`

**Interfaces:**
- Nenhuma interface nova — este task só refina visualmente componentes já existentes, sem alterar suas props/contratos.

- [ ] **Step 1: Invocar o skill frontend-design**

Antes de qualquer alteração visual, invoque `Skill(frontend-design:frontend-design)` passando como contexto: a paleta aprovada (azul `#0ea5e9`/`#0284c7`, sidebar gradiente `#0f172a`→`#1e3a5f`, fundo branco), o spec em `docs/superpowers/specs/2026-08-30-fundacao-design.md`, e as telas construídas nas Tasks 4-7 (login, shell com sidebar/topbar, usuários, papéis). Siga a orientação do skill para refinar tipografia, espaçamento, estados de hover/foco, e hierarquia visual — sem introduzir bibliotecas de UI além de Tailwind/shadcn (Global Constraints).

- [ ] **Step 2: Aplicar os refinamentos**

Implemente os ajustes indicados pelo skill nos arquivos listados acima — espaçamento consistente, estados de foco acessíveis nos inputs, transições suaves no sidebar, empty states mais trabalhados nas tabelas (ex: "Nenhum usuário cadastrado ainda" em vez de tabela vazia), e um cabeçalho mais elaborado nas páginas de Usuários/Papéis.

- [ ] **Step 3: Rodar a suite de testes para garantir que nada quebrou**

```bash
npm test
```

Esperado: todos os testes continuam passando (o polish é puramente visual, não deve alterar lógica).

- [ ] **Step 4: Revisão visual manual**

```bash
npm run dev
```

Percorra manualmente: `/login`, `/dashboard` (placeholder), `/usuarios`, `/usuarios/papeis`, `/acesso-negado`. Confirme que a paleta azul/preto/branco está consistente em todas as telas e que o resultado bate com os mockups aprovados no brainstorming.

- [ ] **Step 5: Commitar**

```bash
git add -A
git commit -m "polish: refine visual design across login, shell and usuarios screens"
```

---

### Task 9: Deploy em produção (Vercel + Supabase Cloud)

**Files:**
- Create: `vercel.json` (se necessário para configuração de build), `supabase/migrations/` (já existente, aplicado ao projeto cloud)

**Interfaces:**
- Nenhuma interface de código nova — task de infraestrutura/deploy.

- [ ] **Step 1: Criar o projeto Supabase de produção**

No painel do Supabase (supabase.com/dashboard), crie um novo projeto para a distribuidora. Anote a `Project URL`, `anon key` e `service_role key`.

- [ ] **Step 2: Aplicar as migrações no projeto de produção**

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

- [ ] **Step 3: Criar o primeiro usuário Admin real**

No painel do Supabase (Authentication → Users), crie o primeiro usuário admin manualmente (ou use `supabase.auth.admin.inviteUserByEmail` via um script pontual). Insira o `profile` correspondente vinculado ao papel `Admin`:

```sql
insert into profiles (id, nome, email, role_id)
select id, 'Nome do Admin', email, (select id from roles where nome = 'Admin')
from auth.users where email = 'email-do-admin-real@empresa.com';
```

- [ ] **Step 4: Conectar o repositório à Vercel**

No painel da Vercel, importe o repositório e configure as variáveis de ambiente de produção:

```
NEXT_PUBLIC_SUPABASE_URL=<Project URL de produção>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key de produção>
SUPABASE_SERVICE_ROLE_KEY=<service_role key de produção>
```

- [ ] **Step 5: Disparar o deploy e validar**

Faça o deploy (push pra branch principal ou deploy manual pelo painel). Acesse a URL de produção e confirme: `/dashboard` redireciona pra `/login` quando deslogado; login com o admin real funciona; sidebar mostra os 5 módulos; `/usuarios` permite criar um segundo usuário e o convite chega no email real.

- [ ] **Step 6: Commitar qualquer configuração de deploy adicionada**

```bash
git add -A
git commit -m "chore: finalize production deploy configuration"
```
