# Cadastro de Clientes

**Data:** 2026-09-01
**Status:** Aprovado para implementação

## Contexto

Este é o segundo módulo do sistema de gerenciamento da distribuidora/transportadora, construído sobre a Fundação (autenticação, papéis, navegação — ver [docs/superpowers/specs/2026-08-30-fundacao-design.md](2026-08-30-fundacao-design.md)). O módulo `clientes` já existe como `module_key` desde a Fundação; a página `/clientes` hoje é um placeholder "em construção" que este módulo substitui.

## Objetivo deste módulo

Permitir o cadastro, consulta, edição e inativação de clientes (pessoa física ou jurídica) da distribuidora, servindo de base para os módulos futuros de Cargas (vendas, entregas).

## Escopo

**Dentro do escopo:**
- CRUD de clientes (pessoa física e jurídica), com inativação em vez de exclusão física
- Validação de CPF/CNPJ (dígito verificador) e unicidade de documento
- Listagem com busca por nome/documento
- Páginas dedicadas de criar/editar (não modal, dado o volume de campos)

**Fora do escopo (módulos futuros):**
- Condição comercial do cliente (limite de crédito, prazo de pagamento, tabela de preço/desconto) — pertence ao módulo de Cargas
- Qualquer vínculo com vendas, entregas ou notas fiscais
- Múltiplos contatos ou múltiplos endereços por cliente (um único conjunto de campos de contato/endereço nesta fase)
- Permissões granulares dentro do módulo (ver vs. editar) — mantém o modelo tudo-ou-nada da Fundação: quem tem acesso ao `module_key` `clientes` pode criar/editar/inativar livremente

## Modelo de dados

```
clientes
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

Regras:
- `documento` é armazenado sem máscara (só dígitos) e validado por dígito verificador (algoritmo módulo 11 padrão de CPF/CNPJ) tanto no client (feedback imediato) quanto na Server Action (fonte da verdade).
- `unique` em `documento` garante não-duplicidade a nível de banco; a Server Action traduz a violação em mensagem amigável.
- Não existe exclusão física de cliente pela aplicação — inativação via `ativo=false` é o único caminho de "remoção".
- `nome_fantasia` só é exibido/editável no formulário quando `tipo='pj'`; permanece `null` para PF.

## Autorização (RLS)

Reaproveita integralmente o sistema de papéis da Fundação — nenhuma tabela ou papel novo.

```sql
alter table clientes enable row level security;

create policy "clientes_select_com_acesso"
  on clientes for select using (has_module_access('clientes'));

create policy "clientes_insert_com_acesso"
  on clientes for insert with check (has_module_access('clientes'));

create policy "clientes_update_com_acesso"
  on clientes for update using (has_module_access('clientes'));
```

Sem policy de `delete` — não há caminho de exclusão física pela aplicação.

Página `/clientes` e sub-rotas (`/clientes/novo`, `/clientes/[id]/editar`) protegidas por `requireModuleAccess('clientes')`, mesmo padrão das páginas da Fundação.

## Server Actions

`actions/cliente-actions.ts`:
- `listClientes(query?: string): Promise<Cliente[]>` — lista todos os clientes, ou filtra por nome/documento (`ilike`) quando `query` é passado.
- `getCliente(id: string): Promise<Cliente | null>` — busca um cliente para a tela de edição.
- `createCliente(data: ClienteInput): Promise<Cliente>` — valida documento (dígito verificador) antes de inserir; traduz erro de unicidade em mensagem amigável.
- `updateCliente(id: string, data: ClienteInput): Promise<Cliente>` — mesma validação de documento.
- `toggleClienteAtivo(id: string, ativo: boolean): Promise<void>` — ação dedicada ao botão de ativar/inativar na listagem, sem abrir o formulário completo.

`lib/validation/documento.ts`:
- `validarCpf(documento: string): boolean`
- `validarCnpj(documento: string): boolean`
- `validarDocumento(tipo: 'pf' | 'pj', documento: string): boolean` — despacha para a validação correta.

## Navegação e telas

- `/clientes` — lista com busca (nome/documento), coluna de status (badge ativo/inativo), botão "Novo cliente"; por linha: editar e ativar/inativar. Substitui o placeholder "em construção" herdado da Fundação.
- `/clientes/novo` — formulário completo. Campo `tipo` como toggle PF/PJ que muda o rótulo do campo de documento (CPF↔CNPJ) e exibe/oculta `nome_fantasia`.
- `/clientes/[id]/editar` — mesmo formulário, pré-preenchido via `getCliente`.
- Sidebar: o item "👤 Clientes" já existe desde a Fundação — só passa a apontar para a listagem real, sem mudança de navegação.

## Tratamento de erros

- Documento com dígito verificador inválido: erro inline no campo, formulário não submete.
- Documento duplicado: mensagem inline no formulário ("Já existe um cliente cadastrado com esse documento").
- Cliente não encontrado em `/clientes/[id]/editar`: 404 padrão do Next.js.
- Acesso sem permissão ao módulo `clientes`: mesmo comportamento da Fundação (item não aparece na sidebar; acesso direto por URL mostra `/acesso-negado`).

## Testes

- Unitário: `lib/validation/documento.ts` — CPFs/CNPJs válidos e inválidos, casos de borda (todos os dígitos iguais, tamanho incorreto).
- Integração: `createCliente`/`updateCliente` contra o Supabase real (mesmo padrão dos testes da Fundação) — cobre unicidade de documento e o fluxo de `toggleClienteAtivo`.
- Verificação manual no navegador: criar cliente PF e PJ, buscar por nome e por documento, editar, inativar e reativar.
