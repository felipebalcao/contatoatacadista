# Cadastro de Produtos

**Data:** 2026-09-03 (revisado em 2026-09-04)
**Status:** Aprovado para implementação

## Contexto

Este é o terceiro módulo do sistema de gerenciamento da distribuidora/transportadora, construído sobre a Fundação (autenticação, papéis, navegação — ver [docs/superpowers/specs/2026-08-30-fundacao-design.md](2026-08-30-fundacao-design.md)) e seguindo o mesmo padrão dos módulos de Clientes e Fornecedores ([docs/superpowers/specs/2026-09-01-clientes-design.md](2026-09-01-clientes-design.md), [docs/superpowers/specs/2026-09-03-fornecedores-design.md](2026-09-03-fornecedores-design.md)). O `module_key` `produtos` já existe desde a Fundação; a página `/produtos` hoje é um placeholder "em construção" que este módulo substitui.

## Objetivo deste módulo

Permitir o cadastro, consulta, edição e inativação de produtos do catálogo da distribuidora, servindo de base de identificação para o futuro módulo de Cargas (compras, estoque por lote e vendas).

## Escopo

**Dentro do escopo:**
- CRUD de produtos (catálogo puro), com inativação em vez de exclusão física
- Cinco campos: nome, código, código de barras, unidade, categoria (ver "Modelo de dados")
- Listagem com busca por nome/código

**Fora do escopo (módulo futuro de Cargas):**
- Preço de compra e de venda — definidos por carga (lote), não pelo produto; o mesmo produto pode ter preços diferentes em cargas diferentes
- Estoque/quantidade — não existe saldo agregado no produto; a quantidade de cada produto vive dentro de cada carga (lote comprado) e é abatida conforme as vendas registradas naquela carga
- Vínculo com fornecedores e importação de XML de NFe — quando Cargas for desenhado, o casamento entre o XML importado e um produto já cadastrado usa o `código` e/ou `código de barras` já existentes; nenhum campo extra dedicado a isso é necessário agora
- Categoria como cadastro estruturado — nesta fase é texto livre no próprio produto (ver "Modelo de dados"); migrar para uma tabela `categorias` com FK fica em aberto para quando/se a padronização virar necessidade real
- Permissões granulares dentro do módulo (ver vs. editar) — mantém o modelo tudo-ou-nada da Fundação: quem tem acesso ao `module_key` `produtos` pode criar/editar/inativar livremente

## Modelo de dados

```
produtos
  id              uuid PK default gen_random_uuid()
  codigo          text not null unique    -- digitado por quem cadastra, código de referência interno
  codigo_barras   text                    -- opcional, EAN/código de barras real do produto
  nome            text not null
  unidade         text not null           -- texto livre: "un", "kg", "cx", "L", etc.
  categoria       text                    -- opcional, texto livre
  ativo           boolean not null default true
  created_at      timestamptz not null default now()
```

Regras:
- `codigo` é digitado por quem cadastra (não gerado pelo sistema) — é o código de referência interno que a distribuidora já usa. `unique` a nível de banco garante não-duplicidade; a Server Action traduz a violação em mensagem amigável, mesmo padrão do `documento` de Clientes/Fornecedores.
- `codigo_barras` não tem constraint de unicidade nem validação de formato (não valida dígito verificador EAN) — é um campo de texto livre opcional, preenchível a qualquer momento.
- Não existe exclusão física de produto pela aplicação — inativação via `ativo=false` é o único caminho de "remoção", mesmo padrão de Clientes/Fornecedores.

## Autorização (RLS)

Reaproveita integralmente o sistema de papéis da Fundação — nenhuma tabela ou papel novo.

```sql
alter table produtos enable row level security;

create policy "produtos_select_com_acesso"
  on produtos for select using (has_module_access('produtos'));

create policy "produtos_insert_com_acesso"
  on produtos for insert with check (has_module_access('produtos'));

create policy "produtos_update_com_acesso"
  on produtos for update using (has_module_access('produtos'));
```

Sem policy de `delete` — não há caminho de exclusão física pela aplicação.

Página `/produtos` e sub-rotas (`/produtos/novo`, `/produtos/[id]/editar`) protegidas por `requireModuleAccess('produtos')`, mesmo padrão de Clientes/Fornecedores/Fundação. Todas as Server Actions em `produto-actions.ts` chamam `assertModuleAccess('produtos')` como primeira linha, mesmo padrão endurecido aplicado em `cliente-actions.ts`/`fornecedor-actions.ts`.

## Server Actions

`actions/produto-actions.ts`:
- `listProdutos(query?: string): Promise<Produto[]>` — lista todos os produtos, ou filtra por nome/código (`ilike`) quando `query` é passado.
- `getProduto(id: string): Promise<Produto | null>` — busca um produto para a tela de edição.
- `createProduto(data: ProdutoInput): Promise<Produto>` — insere; traduz violação de unicidade de `codigo` (Postgres `23505`) em mensagem amigável ("Já existe um produto cadastrado com esse código."); enumera colunas explicitamente no insert (sem spread do input bruto, mesma proteção contra mass-assignment de Clientes/Fornecedores).
- `updateProduto(id: string, data: ProdutoInput): Promise<Produto>` — mesma tradução de erro de unicidade.
- `toggleProdutoAtivo(id: string, ativo: boolean): Promise<void>` — ação dedicada ao botão de ativar/inativar na listagem, sem abrir o formulário completo.

`ProdutoInput` (tipo em `lib/types/database.ts`): `{ codigo, codigo_barras, nome, unidade, categoria }` — sem `ativo` (controlado só via `toggleProdutoAtivo`); campos opcionais (`codigo_barras`, `categoria`) tipados `string | null`, mesmo padrão de Clientes/Fornecedores.

## Navegação e telas

- `/produtos` — lista com busca (nome/código), coluna de status (badge ativo/inativo), botão "Novo produto"; por linha: código, nome, unidade, categoria, editar e ativar/inativar. Substitui o placeholder "em construção" herdado da Fundação.
- `/produtos/novo` — formulário com código, código de barras (opcional), nome, unidade, categoria (opcional).
- `/produtos/[id]/editar` — mesmo formulário, pré-preenchido via `getProduto`, incluindo o `codigo` (editável, ao contrário de Clientes/Fornecedores onde o documento raramente muda — aqui é um código de referência interno que pode precisar de correção).
- Sidebar: o item "📦 Produtos" já existe desde a Fundação — só passa a apontar para a listagem real, sem mudança de navegação.

## Tratamento de erros

- Código duplicado: mensagem inline no formulário ("Já existe um produto cadastrado com esse código."), mesmo padrão do documento duplicado em Clientes/Fornecedores.
- Produto não encontrado em `/produtos/[id]/editar`: 404 padrão do Next.js.
- Acesso sem permissão ao módulo `produtos`: mesmo comportamento da Fundação e de Clientes/Fornecedores (item não aparece na sidebar; acesso direto por URL mostra `/acesso-negado`).

## Testes

- Integração: `createProduto`/`updateProduto`/`toggleProdutoAtivo` contra o Supabase real (mesmo padrão dos testes de Clientes/Fornecedores) — cobre unicidade de código, edição, o fluxo de ativar/inativar, e o guard de `assertModuleAccess`.
- Verificação manual no navegador: criar produto, buscar por nome e por código, editar (incluindo alterar o código), inativar e reativar.
