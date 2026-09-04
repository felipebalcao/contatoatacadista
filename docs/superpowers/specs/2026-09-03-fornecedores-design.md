# Cadastro de Fornecedores

**Data:** 2026-09-03
**Status:** Aprovado para implementação

## Contexto

Este é o quarto módulo do sistema de gerenciamento da distribuidora/transportadora, construído sobre a Fundação (autenticação, papéis, navegação — ver [docs/superpowers/specs/2026-08-30-fundacao-design.md](2026-08-30-fundacao-design.md)) e espelhando o módulo de Clientes ([docs/superpowers/specs/2026-09-01-clientes-design.md](2026-09-01-clientes-design.md)), inclusive reaproveitando a validação de CPF/CNPJ já implementada em `lib/validation/documento.ts`.

Diferente de Clientes e Produtos, o `module_key` `fornecedores` **não existe ainda** — precisa ser registrado como parte deste módulo (ver "Registro do módulo" abaixo).

## Objetivo deste módulo

Permitir o cadastro, consulta, edição e inativação de fornecedores (pessoa física ou jurídica) da distribuidora, servindo de base para o futuro módulo de Cargas (compras/lotes, cada carga vinculada a um fornecedor).

## Escopo

**Dentro do escopo:**
- CRUD de fornecedores (pessoa física e jurídica), com inativação em vez de exclusão física
- Validação de CPF/CNPJ (reaproveitando `validarDocumento` de `lib/validation/documento.ts`) e unicidade de documento
- Listagem com busca por nome/documento
- Registro do `module_key` `fornecedores` na Fundação (constraint, seed de permissão do Admin, tipo `ModuleKey`, item de navegação)

**Fora do escopo (módulos futuros):**
- Condição comercial (prazo de entrega, forma de pagamento, banco/PIX) — pertence ao módulo de Cargas, mesmo raciocínio usado para deixar a condição comercial do cliente fora deste módulo
- Qualquer vínculo com cargas/compras/notas fiscais
- Múltiplos contatos ou múltiplos endereços por fornecedor
- Permissões granulares dentro do módulo — mantém o modelo tudo-ou-nada da Fundação

## Registro do módulo

Diferente de Clientes/Produtos, a migração deste módulo também precisa:
1. Alterar o `check` de `role_permissions.module_key` para incluir `'fornecedores'`.
2. Inserir a permissão do módulo para o papel `Admin` (mesmo padrão do seed original em `0001_fundacao.sql` — só o Admin recebe acesso por padrão; outros papéis, incluindo Financeiro, continuam com zero permissões até serem configurados manualmente na tela de Usuários/Papéis).
3. Adicionar `'fornecedores'` ao type `ModuleKey` (`lib/types/database.ts`) e ao array `MODULE_KEYS` (`lib/auth/permissions.ts`).
4. Adicionar o item "Fornecedores" à sidebar (`components/layout/sidebar.tsx`), apontando para `/fornecedores`.
5. Criar a página placeholder-que-vira-real em `app/(app)/fornecedores/page.tsx` (não existe hoje — diferente de clientes/produtos, que já tinham placeholder herdado da Fundação).

## Modelo de dados

```
fornecedores
  id              uuid PK default gen_random_uuid()
  tipo            text not null check (tipo in ('pf','pj'))
  documento       text not null unique    -- CPF (11 dígitos) ou CNPJ (14 dígitos), somente números
  nome            text not null           -- nome completo (PF) ou razão social (PJ)
  nome_fantasia   text                    -- opcional, só relevante para PJ
  telefone        text
  email           text
  endereco_rua    text
  endereco_numero text
  endereco_bairro text
  endereco_cidade text
  endereco_uf     text
  endereco_cep    text
  observacoes     text
  ativo           boolean not null default true
  created_at      timestamptz not null default now()
```

Regras: idênticas às de Clientes — `documento` sem máscara, validado por dígito verificador tanto no client quanto na Server Action; `unique` a nível de banco; sem exclusão física, só inativação; `nome_fantasia` só relevante para `tipo='pj'`.

## Autorização (RLS)

```sql
alter table fornecedores enable row level security;

create policy "fornecedores_select_com_acesso"
  on fornecedores for select using (has_module_access('fornecedores'));

create policy "fornecedores_insert_com_acesso"
  on fornecedores for insert with check (has_module_access('fornecedores'));

create policy "fornecedores_update_com_acesso"
  on fornecedores for update using (has_module_access('fornecedores'));
```

Sem policy de `delete`. Página `/fornecedores` e sub-rotas protegidas por `requireModuleAccess('fornecedores')`; todas as Server Actions chamam `assertModuleAccess('fornecedores')` como primeira linha (mesmo endurecimento aplicado em `cliente-actions.ts`).

## Server Actions

`actions/fornecedor-actions.ts`:
- `listFornecedores(query?: string): Promise<Fornecedor[]>`
- `getFornecedor(id: string): Promise<Fornecedor | null>`
- `createFornecedor(data: FornecedorInput): Promise<Fornecedor>` — valida documento antes de inserir; traduz erro de unicidade em mensagem amigável; enumera colunas explicitamente no insert (sem spread do input bruto).
- `updateFornecedor(id: string, data: FornecedorInput): Promise<Fornecedor>`
- `toggleFornecedorAtivo(id: string, ativo: boolean): Promise<void>`

Reaproveita `validarDocumento` de `lib/validation/documento.ts` sem alterações.

## Navegação e telas

- `/fornecedores` — lista com busca (nome/documento), badge ativo/inativo, botão "Novo fornecedor"; por linha: editar e ativar/inativar.
- `/fornecedores/novo` — formulário completo, toggle PF/PJ (mesmo componente/padrão do formulário de Clientes).
- `/fornecedores/[id]/editar` — mesmo formulário, pré-preenchido via `getFornecedor`.
- Sidebar: novo item "Fornecedores", ícone `Building2` do lucide-react (já é uma dependência do projeto; distingue do `Truck` usado no logo e do `Users` de Clientes).

## Tratamento de erros

Idêntico a Clientes: documento inválido → erro inline no campo; documento duplicado → mensagem inline no formulário; fornecedor não encontrado em editar → 404; acesso sem permissão → item some da sidebar, acesso direto por URL mostra `/acesso-negado`.

## Testes

- Integração: `createFornecedor`/`updateFornecedor`/`toggleFornecedorAtivo` contra o Supabase real (mesmo padrão de `cliente-actions.test.ts`) — cobre unicidade de documento e o guard de `assertModuleAccess`.
- Regressão do registro do módulo: teste garantindo que o papel Admin tem acesso a `fornecedores` após a migração (mesmo padrão que os testes da Fundação verificam os módulos existentes).
- Verificação manual no navegador: criar fornecedor PF e PJ, buscar, editar, inativar/reativar, e confirmar que o item "Fornecedores" só aparece na sidebar de papéis com a permissão concedida.
