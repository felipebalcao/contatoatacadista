# Cadastro de Produtos

**Data:** 2026-09-03
**Status:** Aprovado para implementação

## Contexto

Este é o terceiro módulo do sistema de gerenciamento da distribuidora/transportadora, construído sobre a Fundação (autenticação, papéis, navegação — ver [docs/superpowers/specs/2026-08-30-fundacao-design.md](2026-08-30-fundacao-design.md)) e seguindo o mesmo padrão do módulo de Clientes ([docs/superpowers/specs/2026-09-01-clientes-design.md](2026-09-01-clientes-design.md)). O `module_key` `produtos` já existe desde a Fundação; a página `/produtos` hoje é um placeholder "em construção" que este módulo substitui.

## Objetivo deste módulo

Permitir o cadastro, consulta, edição e inativação de produtos do catálogo da distribuidora, servindo de base de identificação para o futuro módulo de Cargas (compras, estoque por lote e vendas).

## Escopo

**Dentro do escopo:**
- CRUD de produtos (catálogo puro), com inativação em vez de exclusão física
- Código interno gerado automaticamente pelo sistema, único
- Campo opcional para o código do produto usado pelo fornecedor na nota fiscal (`codigo_nfe`), guardado para viabilizar a futura importação de XML de NFe em Cargas
- Listagem com busca por nome/código

**Fora do escopo (módulo futuro de Cargas):**
- Preço de compra e de venda — definidos por carga (lote), não pelo produto; o mesmo produto pode ter preços diferentes em cargas diferentes
- Estoque/quantidade — não existe saldo agregado no produto; a quantidade de cada produto vive dentro de cada carga (lote comprado) e é abatida conforme as vendas registradas naquela carga
- Vínculo com fornecedores e importação de XML de NFe — a lógica de casar o `codigo_nfe` do produto com o código do XML importado é implementada quando Cargas for desenhado
- Categoria como cadastro estruturado — nesta fase é texto livre no próprio produto (ver "Modelo de dados"); migrar para uma tabela `categorias` com FK fica em aberto para quando/se a padronização virar necessidade real
- Permissões granulares dentro do módulo (ver vs. editar) — mantém o modelo tudo-ou-nada da Fundação: quem tem acesso ao `module_key` `produtos` pode criar/editar/inativar livremente

## Modelo de dados

```
produtos
  id              uuid PK default gen_random_uuid()
  codigo          text not null unique    -- gerado automaticamente pelo sistema (sequence), não editável
  nome            text not null
  unidade         text not null           -- texto livre: "un", "kg", "cx", "L", etc.
  categoria       text                    -- opcional, texto livre
  codigo_nfe      text                    -- opcional, código do produto na nota fiscal do fornecedor
  ativo           boolean not null default true
  created_at      timestamptz not null default now()
```

Regras:
- `codigo` é gerado pelo banco a partir de uma sequence (`produtos_codigo_seq`), formatado como texto de largura fixa (ex: `"0001"`, `"0002"`) via `default` da coluna — evita corrida entre inserções concorrentes e mantém a Server Action simples (não calcula o código, só insere). Não é editável nas telas de criar/editar.
- `unique` em `codigo` garante não-duplicidade a nível de banco (proteção redundante à geração automática, mesmo padrão de defesa em profundidade usado no `documento` de Clientes).
- `codigo_nfe` não tem constraint de unicidade — o mesmo produto pode ser referenciado por códigos diferentes em notas de fornecedores diferentes, e o campo é livre para preenchimento a qualquer momento (na criação ou depois, editando o produto).
- Não existe exclusão física de produto pela aplicação — inativação via `ativo=false` é o único caminho de "remoção", mesmo padrão de Clientes.

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

Página `/produtos` e sub-rotas (`/produtos/novo`, `/produtos/[id]/editar`) protegidas por `requireModuleAccess('produtos')`, mesmo padrão das páginas de Clientes e da Fundação. Todas as Server Actions em `produto-actions.ts` chamam `assertModuleAccess('produtos')` como primeira linha, mesmo padrão endurecido aplicado em `cliente-actions.ts` e nas actions da Fundação.

## Server Actions

`actions/produto-actions.ts`:
- `listProdutos(query?: string): Promise<Produto[]>` — lista todos os produtos, ou filtra por nome/código (`ilike`) quando `query` é passado.
- `getProduto(id: string): Promise<Produto | null>` — busca um produto para a tela de edição.
- `createProduto(data: ProdutoInput): Promise<Produto>` — insere sem informar `codigo` (o banco gera via `default`); enumera colunas explicitamente no insert (sem spread do input bruto, mesma proteção contra mass-assignment aplicada em Clientes).
- `updateProduto(id: string, data: ProdutoInput): Promise<Produto>` — atualiza nome/unidade/categoria/codigo_nfe; nunca aceita `codigo` do input.
- `toggleProdutoAtivo(id: string, ativo: boolean): Promise<void>` — ação dedicada ao botão de ativar/inativar na listagem, sem abrir o formulário completo.

`ProdutoInput` (tipo em `lib/types/database.ts`): `{ nome, unidade, categoria?, codigo_nfe? }` — sem `codigo`, sem `ativo` (controlado só via `toggleProdutoAtivo`).

## Navegação e telas

- `/produtos` — lista com busca (nome/código), coluna de status (badge ativo/inativo), botão "Novo produto"; por linha: código, nome, unidade, categoria, editar e ativar/inativar. Substitui o placeholder "em construção" herdado da Fundação.
- `/produtos/novo` — formulário com nome, unidade, categoria (opcional), código NFe (opcional). Sem campo de código (gerado após salvar).
- `/produtos/[id]/editar` — mesmo formulário, pré-preenchido via `getProduto`, com o `codigo` exibido como somente-leitura.
- Sidebar: o item "📦 Produtos" já existe desde a Fundação — só passa a apontar para a listagem real, sem mudança de navegação.

## Tratamento de erros

- Falha ao gerar código único (colisão na sequence, extremamente improvável): erro genérico de submissão, mesmo tratamento de falha de Server Action já usado em Clientes (surfaced na UI, não engolido silenciosamente).
- Produto não encontrado em `/produtos/[id]/editar`: 404 padrão do Next.js.
- Acesso sem permissão ao módulo `produtos`: mesmo comportamento da Fundação e de Clientes (item não aparece na sidebar; acesso direto por URL mostra `/acesso-negado`).

## Testes

- Integração: `createProduto`/`updateProduto`/`toggleProdutoAtivo` contra o Supabase real (mesmo padrão dos testes de Clientes) — cobre geração automática de código único, edição e o fluxo de ativar/inativar, e o guard de `assertModuleAccess`.
- Verificação manual no navegador: criar produto, conferir código gerado, buscar por nome e por código, editar, inativar e reativar.
