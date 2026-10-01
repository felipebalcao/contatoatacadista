# Vendas (dentro de cada carga)

**Data:** 2026-09-30
**Status:** Aprovado para implementação

## Contexto

Hoje uma Carga ([docs/superpowers/specs/2026-09-04-cargas-design.md](2026-09-04-cargas-design.md)) registra apenas o lado da compra: itens comprados, custos extras e pagamentos ao fornecedor. Não existe nenhum registro de venda, nem saldo de estoque por produto — o sistema não sabe quanto de cada produto ainda está disponível pra vender.

Este spec adiciona uma aba "Vendas" dentro de cada carga (mesmo padrão de Custos e Pagamentos), e introduz o conceito de **estoque atual por produto** necessário pra ela funcionar: toda carga (compra) soma no estoque, toda venda desconta.

## Escopo

**Dentro do escopo:**
- Campo `estoque_atual` no cadastro de Produtos (saldo único por produto, não por carga/lote).
- Migração de backfill: o estoque inicial de cada produto é a soma das quantidades de todas as cargas já cadastradas até hoje (não existe venda ainda pra descontar).
- Toda carga nova ou editada passa a atualizar o estoque automaticamente (as funções de banco `criar_carga_com_itens`/`atualizar_carga_com_itens` já existentes ganham esse efeito colateral).
- Aba "Vendas" na tela de detalhe da carga, com lista de vendas daquela carga e um modal de criar/editar.
- Cada venda pertence a exatamente uma carga (pra calcular quanto se vendeu e lucrou daquele lote de compra específico), mas desconta de um estoque que é compartilhado entre todas as cargas do mesmo produto. Uma carga pode ter zero ou várias vendas.
- Campos da venda: cliente (cadastro existente), data, uma ou mais notas fiscais (texto livre), vendedor (texto livre), empresa (texto livre), lista de produtos vendidos (produto, quantidade, preço unitário, subtotal calculado), tipo de comissão (Percentual, Isento, Fixo, Misto) com o(s) campo(s) de valor correspondente(s).
- Validação de estoque: salvar uma venda com quantidade maior que o estoque disponível de algum produto bloqueia a operação, com mensagem indicando qual produto e quanto está disponível.
- Editar ou excluir uma venda desfaz o efeito da venda antiga no estoque antes de aplicar o novo (ou simplesmente devolve, no caso de exclusão).
- Os cards de resumo da carga (que já mostram Total/Pago/Falta) ganham "Vendido" e "Lucro".

**Fora do escopo:**
- Vendedor e Empresa como cadastros estruturados — continuam texto livre por enquanto.
- Edição manual do estoque fora do fluxo de carga/venda.
- Importação de nota fiscal em XML (item separado, spec própria).
- Aba de Avarias/devoluções (item separado, spec própria, que vai reusar o `estoque_atual` criado aqui).
- Comissão sobre vendedor cadastrado, relatórios de comissão por vendedor, split de comissão por item.

## Arquitetura

### Banco de dados

```sql
alter table produtos
  add column estoque_atual numeric not null default 0;

-- backfill: soma de tudo que já foi comprado em cargas existentes
update produtos p
set estoque_atual = coalesce((
  select sum(ic.quantidade)
  from itens_carga ic
  where ic.produto_id = p.id
), 0);

create table vendas_carga (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  data date not null,
  notas_fiscais text[] not null default '{}',
  vendedor text,
  empresa text,
  tipo_comissao text not null check (tipo_comissao in ('percentual', 'isento', 'fixo', 'misto')),
  comissao_percentual numeric,
  comissao_fixa numeric,
  created_at timestamptz not null default now()
);

create table itens_venda (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas_carga(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade numeric not null check (quantidade > 0),
  preco_unitario numeric not null check (preco_unitario >= 0),
  created_at timestamptz not null default now(),
  unique (venda_id, produto_id)
);
```

A constraint `unique (venda_id, produto_id)` espelha a que já existe em `itens_carga` — impede duas linhas do mesmo produto na mesma venda (o modal já não deixa escolher um produto já adicionado, mas a constraint garante isso também no banco). Uma violação vira a mesma mensagem de estilo já usada em carga: "Não é possível adicionar o mesmo produto duas vezes na venda."

### Tipos (TypeScript)

```ts
export interface Venda {
  id: string
  carga_id: string
  cliente_id: string
  cliente_nome: string
  data: string
  notas_fiscais: string[]
  vendedor: string | null
  empresa: string | null
  tipo_comissao: 'percentual' | 'isento' | 'fixo' | 'misto'
  comissao_percentual: number | null
  comissao_fixa: number | null
  created_at: string
}

export interface ItemVenda {
  id: string
  produto_id: string
  produto_codigo: string
  produto_nome: string
  produto_unidade: string
  quantidade: number
  preco_unitario: number
}

export interface VendaComItens extends Venda {
  itens: ItemVenda[]
}

export interface VendaInput {
  cliente_id: string
  data: string
  notas_fiscais: string[]
  vendedor: string | null
  empresa: string | null
  tipo_comissao: 'percentual' | 'isento' | 'fixo' | 'misto'
  comissao_percentual: number | null
  comissao_fixa: number | null
  itens: { produto_id: string; quantidade: number; preco_unitario: number }[]
}
```

RLS: mesmo padrão de `custos_carga`/`pagamentos_carga` — select/insert/update/delete condicionados a `has_module_access('cargas')`.

`tipo_comissao = 'percentual'` exige `comissao_percentual` preenchido; `'fixo'` exige `comissao_fixa`; `'misto'` exige os dois; `'isento'` não usa nenhum dos dois. Essa regra é validada na camada de aplicação (`validarVenda`, mesmo padrão de `validarCusto`/`validarPagamento`), não em constraint de banco.

### Funções de banco (atomicidade)

`criar_carga_com_itens` e `atualizar_carga_com_itens` (já existentes) ganham um passo a mais: depois de gravar os itens, somam a quantidade de cada item no `estoque_atual` do produto correspondente. `atualizar_carga_com_itens` primeiro subtrai os itens antigos (antes de apagá-los) e depois soma os novos — mesmo efeito líquido de um diff, sem precisar calcular o diff de verdade.

Duas funções novas, no mesmo espírito:

```sql
create or replace function criar_venda_com_itens(
  p_carga_id uuid,
  p_cliente_id uuid,
  p_data date,
  p_notas_fiscais text[],
  p_vendedor text,
  p_empresa text,
  p_tipo_comissao text,
  p_comissao_percentual numeric,
  p_comissao_fixa numeric,
  p_itens jsonb
) returns uuid
-- valida estoque suficiente de cada produto ANTES de inserir qualquer coisa
-- (se faltar, RAISE EXCEPTION com uma mensagem citando o produto e o saldo disponível)
-- insere a venda, insere os itens, desconta o estoque de cada produto

create or replace function atualizar_venda_com_itens(
  p_venda_id uuid,
  p_cliente_id uuid,
  p_data date,
  p_notas_fiscais text[],
  p_vendedor text,
  p_empresa text,
  p_tipo_comissao text,
  p_comissao_percentual numeric,
  p_comissao_fixa numeric,
  p_itens jsonb
) returns void
-- devolve ao estoque a quantidade dos itens antigos da venda
-- valida estoque suficiente dos itens novos (considerando o estoque já devolvido)
-- se faltar, RAISE EXCEPTION (a transação inteira desfaz, inclusive a devolução)
-- apaga os itens antigos, grava os novos, desconta o estoque
```

A exclusão de uma venda (`deletar_venda_com_itens(p_venda_id)`) devolve a quantidade de cada item ao estoque do produto e depois apaga a venda (cascata apaga os itens).

A mensagem de "estoque insuficiente" vem pronta do Postgres via `RAISE EXCEPTION` e chega à Server Action como `error.message` — a Server Action apenas repassa esse texto como `erro` no `ResultadoAcao`, sem reconstruir a mensagem (mesmo padrão usado hoje pra erros de unicidade).

### Server Actions (`actions/venda-actions.ts`, novo arquivo)

- `listVendas(cargaId: string): Promise<VendaComItens[]>`
- `createVenda(cargaId: string, input: VendaInput): Promise<ResultadoAcao<VendaComItens>>`
- `updateVenda(id: string, input: VendaInput): Promise<ResultadoAcao<VendaComItens>>`
- `deleteVenda(id: string): Promise<ResultadoAcao<void>>`

Todas chamam `assertModuleAccess('cargas')` primeiro. `createVenda`/`updateVenda`/`deleteVenda` seguem o padrão já estabelecido nesta sessão: retornam `ResultadoAcao<T>`, nunca lançam exceção pra erro esperado (estoque insuficiente, carga/venda não encontrada) — só `assertModuleAccess` continua lançando "Acesso negado.".

`actions/carga-actions.ts` ganha `listClientesAtivos(): Promise<{ id: string; nome: string }[]>`, mesmo formato de `listFornecedoresAtivos`, pra popular o seletor de cliente na venda.

### Tela

Nova aba "Vendas" em `components/cargas/carga-abas.tsx` (`ABAS_CARGA` ganha `{ chave: 'vendas', rotulo: 'Vendas' }`), com uma seção (`vendas-secao.tsx`) e um modal (`venda-modal.tsx`) seguindo exatamente o padrão de `custos-secao.tsx`/`custo-modal.tsx`.

O modal de venda:
- Cliente: `<select>` com os clientes de `listClientesAtivos()`.
- Data: `<input type="date">`.
- Notas fiscais: campo de texto + botão "Adicionar", lista de chips removíveis abaixo (mesma ideia de lista incremental já usada pra produtos da carga, só que pra strings soltas em vez de objetos).
- Vendedor, Empresa: `<input>` de texto livre, opcionais.
- Produtos: reaproveita o padrão de `AdicionarProdutoModal`/tabela de itens já usado em `CargaForm` — selecionar produto (da lista geral de produtos ativos, sem filtrar por carga), quantidade, preço unitário, subtotal calculado, total da venda.
- Tipo de comissão: `<select>` com as 4 opções. Ao marcar "Percentual" ou "Misto" aparece um campo de porcentagem; ao marcar "Fixo" ou "Misto" aparece um campo de valor em R$; "Isento" não mostra nenhum.

A lista de vendas (`vendas-secao.tsx`) mostra: data, cliente, NFs, valor total da venda, comissão, com ações de editar/excluir — mesmo layout de `custos-secao.tsx`.

### Resumo da carga

`lib/cargas/resumo.ts` ganha dois campos novos em `ResumoCarga`: `vendido` (soma de quantidade × preço_unitário de todos os itens de todas as vendas da carga) e `lucro`:

```
lucro = vendido
      − custo dos produtos efetivamente vendidos (quantidade vendida × valor_unitario de compra do mesmo produto na carga)
      − soma das comissões de todas as vendas
      − custosExtras (frete, etc., já existente)
```

O "custo dos produtos vendidos" usa o `valor_unitario` de compra do item correspondente NA MESMA CARGA (já que a venda está vinculada a uma carga específica) — se o produto vendido não estiver entre os itens daquela carga (venda de um produto que não veio dessa carga, caso de uso não previsto mas que o modal não impede tecnicamente), o custo desse item entra como zero no cálculo de lucro, não trava a venda. `CargaResumoCards` ganha dois cards novos ("Vendido" e "Lucro").

## Autorização

Mesmo padrão de Custos/Pagamentos: `assertModuleAccess('cargas')` em toda Server Action nova, sem tabela/policy fora do módulo `cargas` já existente.

## Tratamento de erros

- Nenhum produto adicionado à venda: bloqueia salvar, mesma mensagem de estilo já usada em Carga ("Adicione pelo menos um produto à venda.").
- Mesmo produto adicionado duas vezes na mesma venda: "Não é possível adicionar o mesmo produto duas vezes na venda." (constraint `unique (venda_id, produto_id)`, mesmo tratamento do código `23505` já usado em `createCarga`/`updateCarga`).
- Quantidade vendida maior que o estoque disponível: bloqueia salvar, mensagem citando produto e saldo disponível, vinda do Postgres via `RAISE EXCEPTION`.
- Tipo de comissão Percentual/Fixo/Misto sem o valor correspondente preenchido: erro de validação antes de chamar o servidor, mesmo padrão do formulário de carga.
- Venda ou carga não encontrada (editar/excluir uma venda já apagada por outra aba): mensagem "Venda não encontrada.", mesmo padrão de `NAO_ENCONTRADO` em custos/pagamentos.

## Testes

- Unitário: `calcularResumoCarga` com os campos novos (`vendido`, `lucro`), cobrindo o caso de uma venda de produto que não está nos itens da carga (custo zero nesse item, não quebra o cálculo).
- Integração (Supabase real): criar carga → conferir que o estoque do produto subiu; criar venda com estoque suficiente → conferir que o estoque desceu e os itens/comissão foram gravados corretamente; tentar vender mais que o estoque disponível → confirma que é bloqueado e que o estoque não mudou; editar venda trocando quantidade → confirma que o estoque reflete só o efeito líquido da edição; excluir venda → confirma que o estoque volta; editar carga mudando quantidade de um item → confirma que o estoque reflete a mudança.
- Verificação manual no navegador: criar uma venda com NFs múltiplas, cada tipo de comissão, e conferir os cards de Vendido/Lucro atualizando.
