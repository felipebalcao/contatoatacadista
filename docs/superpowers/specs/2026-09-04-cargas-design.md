# Cadastro de Cargas (cadastro manual)

**Data:** 2026-09-04
**Status:** Aprovado para implementação

## Contexto

Este é o quinto módulo do sistema de gerenciamento da distribuidora/transportadora, construído sobre a Fundação (autenticação, papéis, navegação — ver [docs/superpowers/specs/2026-08-30-fundacao-design.md](2026-08-30-fundacao-design.md)) e sobre os módulos de Fornecedores ([docs/superpowers/specs/2026-09-03-fornecedores-design.md](2026-09-03-fornecedores-design.md)) e Produtos ([docs/superpowers/specs/2026-09-03-produtos-design.md](2026-09-03-produtos-design.md)), que este módulo referencia diretamente. O `module_key` `cargas` já existe desde a Fundação; a página `/cargas` hoje é um placeholder "em construção" que este módulo substitui.

Cargas é o módulo onde a distribuidora registra o que comprou de cada fornecedor — cada carga é um lote de compra vinculado a um fornecedor, com uma lista de produtos, suas quantidades e valores de compra. É aqui que o preço e o estoque (por lote) finalmente entram no sistema, depois de terem sido deliberadamente deixados de fora de Clientes/Fornecedores/Produtos.

## Escopo (sub-projeto 1 de 2)

Este spec cobre **só o cadastro manual** de cargas. A importação de XML/NF-e (parsing do XML, casamento automático de produtos por nome/código com tela de confirmação, extração automática de quantidade e valor) é um sub-projeto futuro e deliberadamente fora deste spec — quando desenhado, deve reaproveitar a mesma tabela `itens_carga` e o mesmo fluxo de edição aqui descritos, só trocando a origem dos itens (XML em vez do modal manual).

**Dentro do escopo:**
- CRUD de cargas: fornecedor, nome, data
- Adicionar produtos à carga manualmente, um de cada vez, via modal (produto + quantidade + valor de compra unitário)
- Cálculo de subtotal por item (quantidade × valor unitário) e total da carga, sempre calculados na hora (nunca armazenados)
- Salvamento atômico: carga + todos os itens gravados numa única transação, via função no banco
- Edição: mesmo formulário, substitui a lista de itens inteira ao salvar
- Inativação de carga (mesmo padrão dos outros módulos)
- Listagem com busca

**Fora do escopo:**
- Importação de XML/NF-e (sub-projeto futuro, ver acima)
- Vínculo com vendas/entregas — cargas ainda não têm nenhum conceito de "saída" de estoque; isso é um módulo futuro que vai referenciar `itens_carga`
- Múltiplos fornecedores por carga — uma carga tem exatamente um fornecedor
- Permissões granulares dentro do módulo — mantém o modelo tudo-ou-nada da Fundação

## Modelo de dados

```
cargas
  id              uuid PK default gen_random_uuid()
  fornecedor_id   uuid not null references fornecedores(id)
  nome            text not null
  data            date not null
  ativo           boolean not null default true
  created_at      timestamptz not null default now()

itens_carga
  id              uuid PK default gen_random_uuid()
  carga_id        uuid not null references cargas(id) on delete cascade
  produto_id      uuid not null references produtos(id)
  quantidade      numeric not null check (quantidade > 0)
  valor_unitario  numeric not null check (valor_unitario >= 0)
  created_at      timestamptz not null default now()
  unique (carga_id, produto_id)
```

Regras:
- `quantidade` é `numeric` (não `integer`) porque produtos com unidade "kg"/"L" podem ter quantidades fracionárias.
- `unique (carga_id, produto_id)` garante uma linha por produto por carga a nível de banco — o mesmo produto não pode ser adicionado duas vezes à mesma carga (defesa em profundidade; a UI também impede isso, excluindo do seletor do modal os produtos já adicionados).
- Subtotal (`quantidade × valor_unitario`) e total da carga (soma dos subtotais) nunca são armazenados — sempre calculados na hora da leitura, evitando dessincronia.
- `on delete cascade` em `itens_carga.carga_id`: como não há exclusão física de carga pela aplicação, isso só protege contra uma exclusão manual feita direto no banco.
- Sem `ativo` em `itens_carga` — o item vive e morre com a carga; inativar a carga não inativa itens individualmente (não há caso de uso para isso nesta fase).

## Autorização (RLS)

```sql
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
```

Diferente de Clientes/Fornecedores/Produtos: `itens_carga` **tem** policy de `delete`, porque o fluxo de edição de carga de fato apaga e reinsere os itens (ver "Consistência dos dados" abaixo). `cargas` continua sem `delete` — a carga em si nunca é excluída fisicamente, só inativada.

Como em todos os módulos anteriores, as Server Actions usam `createAdminClient()` (service role), que ignora RLS — a autorização real acontece em `assertModuleAccess('cargas')` no início de cada Server Action, e essas policies são defesa em profundidade, não o mecanismo de aplicação.

**Divergência conhecida entre RLS e autorização da aplicação:** `listFornecedoresAtivos`/`listProdutosAtivos` (usadas para popular os seletores de fornecedor e produto neste módulo) são gated apenas por `assertModuleAccess('cargas')` — deliberado, já que um usuário só com acesso a `cargas` precisa ler nomes de fornecedor/produto para montar uma carga. As policies de RLS em `fornecedores`/`produtos`, porém, exigem `has_module_access('fornecedores')`/`has_module_access('produtos')` respectivamente, sem exceção para `cargas`. Isso é inofensivo hoje porque toda Server Action usa `createAdminClient()` (service role), que ignora RLS — mas se a aplicação algum dia deixar de usar o client de service role nessas leituras, um usuário só-cargas seria bloqueado pelo RLS apesar de a aplicação permitir isso intencionalmente. Registrado aqui como decisão consciente, não como bug pendente.

## Consistência dos dados: funções no banco

Criar ou editar uma carga envolve duas tabelas (`cargas` e `itens_carga`) que precisam ser gravadas juntas, atomicamente — se a inserção dos itens falhar, a carga não deve ficar órfã sem nenhum item. Isso é resolvido com duas funções PL/pgSQL, cada uma um único statement de função (portanto uma única transação implícita do Postgres):

```sql
create or replace function criar_carga_com_itens(
  p_fornecedor_id uuid,
  p_nome text,
  p_data date,
  p_itens jsonb  -- [{ "produto_id": "...", "quantidade": 1, "valor_unitario": 1.5 }, ...]
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

Se a lista de itens violar `unique (carga_id, produto_id)` (não deveria acontecer, já que a UI impede duplicatas, mas é uma defesa em profundidade), a função inteira falha e nada é gravado — nem a carga nem os itens, no caso de `criar_carga_com_itens`.

Chamadas via `.rpc('criar_carga_com_itens', {...})` e `.rpc('atualizar_carga_com_itens', {...})` a partir das Server Actions.

## Server Actions

`actions/carga-actions.ts`:
- `listCargas(query?: string): Promise<CargaResumo[]>` — lista com nome do fornecedor já resolvido (join) e o total calculado (soma dos itens); filtra por nome da carga ou nome do fornecedor quando `query` é passado.
- `getCarga(id: string): Promise<CargaComItens | null>` — busca uma carga com seus itens (cada item já com nome/unidade do produto resolvidos, para exibir na tabela de edição).
- `createCarga(input: CargaInput): Promise<{ id: string }>` — chama `criar_carga_com_itens` via `.rpc()`.
- `updateCarga(id: string, input: CargaInput): Promise<void>` — chama `atualizar_carga_com_itens` via `.rpc()`.
- `toggleCargaAtivo(id: string, ativo: boolean): Promise<void>` — mesmo padrão dos outros módulos.
- `listFornecedoresAtivos(): Promise<{ id: string; nome: string }[]>` e `listProdutosAtivos(): Promise<{ id: string; codigo: string; nome: string; unidade: string }[]>` — usadas para popular os seletores de fornecedor (no formulário) e produto (no modal); retornam só os registros `ativo = true`. Se uma carga existente referenciar um fornecedor/produto que foi inativado depois, a tela de edição inclui esse registro específico na lista mesmo assim (união com o valor atual), pra não sumir da tela.

`CargaInput` (tipo em `lib/types/database.ts`): `{ fornecedor_id: string; nome: string; data: string; itens: { produto_id: string; quantidade: number; valor_unitario: number }[] }`. Validação de "pelo menos um item" acontece tanto no client (botão "Salvar carga" desabilitado com lista vazia) quanto na Server Action (fonte da verdade).

## Navegação e telas

- `/cargas` — lista: nome, fornecedor, data, valor total (badge), status ativo/inativo, botão "Nova carga"; por linha: editar e ativar/inativar. Substitui o placeholder "em construção".
- `/cargas/novo` e `/cargas/[id]/editar` — mesmo formulário: fornecedor (`<select>`, populado por `listFornecedoresAtivos`), nome, data. Abaixo, uma tabela com os itens já adicionados (produto, quantidade, valor unitário, subtotal, botão remover) e o total da carga. Botão "Adicionar produto" abre um modal.
  - No editar, a tabela de itens vem pré-carregada com os itens existentes (via `getCarga`).
  - "Salvar carga" desabilitado enquanto a lista de itens estiver vazia.
- **Modal "Adicionar produto"** (`components/cargas/adicionar-produto-modal.tsx`, usando o novo `components/ui/dialog.tsx` — ver "Novo componente" abaixo): `<select>` de produto (populado por `listProdutosAtivos`, excluindo os `produto_id` já presentes na lista atual do formulário), campo quantidade (numérico, `> 0`), campo valor unitário (numérico, `>= 0`). Botão "Adicionar" fecha o modal e inclui o item na lista local do formulário — nada é gravado no banco até o usuário clicar "Salvar carga" na tela principal.
- Sidebar: o item "Cargas" já existe desde a Fundação — só passa a apontar para a listagem real.

### Novo componente: `components/ui/dialog.tsx`

Nenhum módulo anterior precisou de um modal de verdade (overlay). `@base-ui/react` já é dependência do projeto e expõe um primitivo `Dialog` (`node_modules/@base-ui/react/dialog`), então este módulo adiciona um wrapper fino em `components/ui/dialog.tsx` (seguindo a mesma convenção de `components/ui/button.tsx`), reaproveitável por módulos futuros que precisarem de modais.

## Tratamento de erros

- Salvar carga sem nenhum item: bloqueado no client (botão desabilitado); a Server Action também valida e rejeita como segunda linha de defesa.
- Adicionar produto duplicado no modal: impossível pela UI (já excluído do seletor); se ocorrer mesmo assim (ex: race condition improvável), a violação de `unique` faz a função SQL falhar e a Server Action traduz em mensagem amigável ("Não é possível adicionar o mesmo produto duas vezes na carga.").
- Carga não encontrada em `/cargas/[id]/editar`: 404 padrão do Next.js.
- Acesso sem permissão ao módulo `cargas`: mesmo comportamento dos módulos anteriores.

## Testes

- Integração: `createCarga`/`updateCarga`/`toggleCargaAtivo` contra o Supabase real — cria uma carga com 2+ itens, confirma atomicidade (o teste de duplicata deve provar que uma tentativa de criar com itens inválidos não deixa a carga órfã: consulta `cargas` depois da falha esperada e confirma que nada foi criado), edição substituindo a lista de itens, ativar/inativar, e o guard de `assertModuleAccess`.
- Verificação manual no navegador: criar carga com 2-3 produtos, conferir total calculado, editar removendo/adicionando itens, tentar salvar sem itens (botão desabilitado), inativar/reativar, conferir que a listagem mostra o total certo.
