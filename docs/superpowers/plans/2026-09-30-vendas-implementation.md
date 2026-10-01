# Vendas (dentro de cada carga) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba "Vendas" dentro de cada carga, com estoque por produto (compra soma, venda desconta), e os cards de resumo da carga passam a mostrar Vendido e Lucro.

**Architecture:** Um campo `estoque_atual` em Produtos, atualizado como efeito colateral das funções de banco que já gravam itens de carga (`criar_carga_com_itens`/`atualizar_carga_com_itens`) e de três funções novas pro ciclo de vida de uma venda (`criar_venda_com_itens`/`atualizar_venda_com_itens`/`deletar_venda_com_itens`), todas atômicas (uma única função de banco por operação, mesmo padrão já usado em Cargas). Server Actions finas em `actions/venda-actions.ts` chamam essas funções via `supabase.rpc(...)` e devolvem `ResultadoAcao<T>`. A tela segue o padrão de Custos/Pagamentos: uma aba, uma seção de listagem, um modal de criar/editar.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 (strict), Tailwind CSS + shadcn/ui, Supabase Postgres (função `plpgsql` + RLS), Vitest.

**Spec:** [docs/superpowers/specs/2026-09-30-vendas-design.md](../specs/2026-09-30-vendas-design.md)

## Global Constraints

- Segue a stack e convenções já estabelecidas: Next.js App Router, TypeScript `strict`, Tailwind + shadcn/ui, Vitest, npm.
- Toda Server Action nova chama `assertModuleAccess('cargas')` como primeira linha — mesmo padrão das ações já existentes neste módulo.
- Erros esperados (estoque insuficiente, produto duplicado na venda, venda/carga não encontrada) voltam como `ResultadoAcao<T>` (`{ sucesso: false; erro: string }`), nunca como exceção lançada — mesmo padrão já migrado nesta sessão pra todo o app (ver `lib/types/acao.ts`). `assertModuleAccess` continua lançando "Acesso negado." normalmente.
- As funções de banco (`criar_venda_com_itens` etc.) fazem a validação de estoque e a gravação numa única chamada atômica — nunca duas chamadas separadas de `supabase.from(...)` que possam deixar o estoque inconsistente se uma falhar no meio.
- `estoque_atual` nunca é editável pelo formulário manual de Produto (`ProdutoInput` não ganha esse campo) — só muda via carga ou venda, conforme o spec.
- **Gotcha conhecido deste projeto:** o `Button` de `components/ui/button.tsx` não tem prop `asChild`. Link estilizado como botão usa `buttonVariants({ variant, size })` na `className` de um `<Link>`.
- `SUPABASE_SERVICE_ROLE_KEY` só em código server-only.
- Nenhuma migração roda sozinha neste projeto (sem Supabase local) — cada task com migração termina pedindo pro humano rodar o SQL no SQL Editor do Supabase Cloud antes dos testes de integração daquela task.

## Review Focus

- Editar uma venda trocando a quantidade de um produto pra MAIS do que tinha antes — o estoque precisa refletir só a diferença líquida (devolve o valor antigo, valida e desconta o novo), não duplicar o desconto (Task 1).
- Tentar vender mais do que o estoque disponível — bloqueia e NÃO deixa o estoque num estado parcialmente alterado (a função inteira cancela, nenhuma linha é gravada) (Task 1).
- Uma venda com produto que não está entre os itens de compra daquela carga — o cálculo de lucro não pode quebrar nem virar `NaN`, o custo desse item específico entra como zero (Task 3).
- Tipo de comissão "Isento" não deve ler `comissao_percentual`/`comissao_fixa` mesmo que venham preenchidos por engano — o cálculo de comissão trata isso explicitamente, não só "se vier null" (Task 3).
- Excluir uma venda devolve exatamente a quantidade que ela tinha descontado, mesmo que a venda tenha sido editada antes (o estoque reflete o item ATUAL da venda no momento da exclusão, não o original) (Task 1).

---

### Task 1: Banco de dados — estoque, vendas_carga, itens_venda e funções atômicas

**Files:**
- Create: `supabase/migrations/0009_vendas.sql`
- Test: `tests/vendas-estoque-rpc.test.ts`

**Interfaces:**
- Produces: coluna `produtos.estoque_atual numeric`; tabelas `vendas_carga`, `itens_venda`; funções `criar_venda_com_itens`, `atualizar_venda_com_itens`, `deletar_venda_com_itens` (chamadas via `supabase.rpc(...)`); `criar_carga_com_itens`/`atualizar_carga_com_itens` (já existentes) passam a também ajustar `estoque_atual`.
- Consumes: tabelas `produtos`, `cargas`, `itens_carga`, `clientes` já existentes; função `has_module_access` já existente.

- [ ] **Step 1: Escrever a migração `supabase/migrations/0009_vendas.sql`**

```sql
alter table produtos
  add column estoque_atual numeric not null default 0;

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

alter table vendas_carga enable row level security;
alter table itens_venda enable row level security;

create policy "vendas_carga_select_com_acesso"
  on vendas_carga for select using (has_module_access('cargas'));
create policy "vendas_carga_insert_com_acesso"
  on vendas_carga for insert with check (has_module_access('cargas'));
create policy "vendas_carga_update_com_acesso"
  on vendas_carga for update using (has_module_access('cargas'));
create policy "vendas_carga_delete_com_acesso"
  on vendas_carga for delete using (has_module_access('cargas'));

create policy "itens_venda_select_com_acesso"
  on itens_venda for select using (has_module_access('cargas'));
create policy "itens_venda_insert_com_acesso"
  on itens_venda for insert with check (has_module_access('cargas'));
create policy "itens_venda_delete_com_acesso"
  on itens_venda for delete using (has_module_access('cargas'));

create or replace function criar_carga_com_itens(
  p_fornecedor_id uuid,
  p_nome text,
  p_data date,
  p_itens jsonb
) returns uuid
language plpgsql
set search_path = public, pg_temp
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

  update produtos p
  set estoque_atual = estoque_atual + v.quantidade
  from (
    select (item->>'produto_id')::uuid as produto_id, (item->>'quantidade')::numeric as quantidade
    from jsonb_array_elements(p_itens) as item
  ) v
  where p.id = v.produto_id;

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
set search_path = public, pg_temp
as $$
begin
  update cargas
  set fornecedor_id = p_fornecedor_id, nome = p_nome, data = p_data
  where id = p_carga_id;

  update produtos p
  set estoque_atual = estoque_atual - ic.quantidade
  from itens_carga ic
  where ic.carga_id = p_carga_id and p.id = ic.produto_id;

  delete from itens_carga where carga_id = p_carga_id;

  insert into itens_carga (carga_id, produto_id, quantidade, valor_unitario)
  select p_carga_id,
         (item->>'produto_id')::uuid,
         (item->>'quantidade')::numeric,
         (item->>'valor_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  update produtos p
  set estoque_atual = estoque_atual + v.quantidade
  from (
    select (item->>'produto_id')::uuid as produto_id, (item->>'quantidade')::numeric as quantidade
    from jsonb_array_elements(p_itens) as item
  ) v
  where p.id = v.produto_id;
end;
$$;

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
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_venda_id uuid;
  v_item record;
begin
  for v_item in
    select (item->>'produto_id')::uuid as produto_id, (item->>'quantidade')::numeric as quantidade
    from jsonb_array_elements(p_itens) as item
  loop
    if (select estoque_atual from produtos where id = v_item.produto_id) < v_item.quantidade then
      raise exception 'Estoque insuficiente de %. Disponível: %, solicitado: %',
        (select nome from produtos where id = v_item.produto_id),
        (select estoque_atual from produtos where id = v_item.produto_id),
        v_item.quantidade;
    end if;
  end loop;

  insert into vendas_carga (carga_id, cliente_id, data, notas_fiscais, vendedor, empresa, tipo_comissao, comissao_percentual, comissao_fixa)
  values (p_carga_id, p_cliente_id, p_data, p_notas_fiscais, p_vendedor, p_empresa, p_tipo_comissao, p_comissao_percentual, p_comissao_fixa)
  returning id into v_venda_id;

  insert into itens_venda (venda_id, produto_id, quantidade, preco_unitario)
  select v_venda_id,
         (item->>'produto_id')::uuid,
         (item->>'quantidade')::numeric,
         (item->>'preco_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  update produtos p
  set estoque_atual = estoque_atual - v.quantidade
  from (
    select (item->>'produto_id')::uuid as produto_id, (item->>'quantidade')::numeric as quantidade
    from jsonb_array_elements(p_itens) as item
  ) v
  where p.id = v.produto_id;

  return v_venda_id;
end;
$$;

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
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item record;
begin
  update produtos p
  set estoque_atual = estoque_atual + iv.quantidade
  from itens_venda iv
  where iv.venda_id = p_venda_id and p.id = iv.produto_id;

  for v_item in
    select (item->>'produto_id')::uuid as produto_id, (item->>'quantidade')::numeric as quantidade
    from jsonb_array_elements(p_itens) as item
  loop
    if (select estoque_atual from produtos where id = v_item.produto_id) < v_item.quantidade then
      raise exception 'Estoque insuficiente de %. Disponível: %, solicitado: %',
        (select nome from produtos where id = v_item.produto_id),
        (select estoque_atual from produtos where id = v_item.produto_id),
        v_item.quantidade;
    end if;
  end loop;

  update vendas_carga
  set cliente_id = p_cliente_id,
      data = p_data,
      notas_fiscais = p_notas_fiscais,
      vendedor = p_vendedor,
      empresa = p_empresa,
      tipo_comissao = p_tipo_comissao,
      comissao_percentual = p_comissao_percentual,
      comissao_fixa = p_comissao_fixa
  where id = p_venda_id;

  delete from itens_venda where venda_id = p_venda_id;

  insert into itens_venda (venda_id, produto_id, quantidade, preco_unitario)
  select p_venda_id,
         (item->>'produto_id')::uuid,
         (item->>'quantidade')::numeric,
         (item->>'preco_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  update produtos p
  set estoque_atual = estoque_atual - v.quantidade
  from (
    select (item->>'produto_id')::uuid as produto_id, (item->>'quantidade')::numeric as quantidade
    from jsonb_array_elements(p_itens) as item
  ) v
  where p.id = v.produto_id;
end;
$$;

create or replace function deletar_venda_com_itens(p_venda_id uuid) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update produtos p
  set estoque_atual = estoque_atual + iv.quantidade
  from itens_venda iv
  where iv.venda_id = p_venda_id and p.id = iv.produto_id;

  delete from vendas_carga where id = p_venda_id;
end;
$$;
```

- [ ] **Step 2: Pedir pro humano rodar essa migração**

Esse projeto não usa Supabase local. Peça pro usuário abrir o SQL Editor do projeto Supabase Cloud (Project Settings → SQL Editor) e executar o conteúdo de `supabase/migrations/0009_vendas.sql`. Não prossiga pro Step 3 sem confirmação de que rodou.

- [ ] **Step 3: Escrever `tests/vendas-estoque-rpc.test.ts` (testa as funções de banco direto via `.rpc(...)`, sem passar pelas Server Actions, que ainda não existem)**

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'

const DOCUMENTO_FORNECEDOR = '11144477735'
const DOCUMENTO_CLIENTE = '22233344456'
const CODIGO_PRODUTO = 'TESTE-VENDA-A'

let fornecedorId: string
let clienteId: string
let produtoId: string

async function estoqueAtual(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('produtos').select('estoque_atual').eq('id', produtoId).single()
  return Number(data?.estoque_atual ?? 0)
}

describe('funções de banco de vendas e estoque', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()
    const { data: fornecedor } = await supabase
      .from('fornecedores')
      .insert({ tipo: 'pf', documento: DOCUMENTO_FORNECEDOR, nome: 'Fornecedor Teste Vendas' })
      .select()
      .single()
    fornecedorId = fornecedor!.id

    const { data: cliente } = await supabase
      .from('clientes')
      .insert({ tipo: 'pf', documento: DOCUMENTO_CLIENTE, nome: 'Cliente Teste Vendas' })
      .select()
      .single()
    clienteId = cliente!.id

    const { data: produto } = await supabase
      .from('produtos')
      .insert({ codigo: CODIGO_PRODUTO, nome: 'Produto Teste Vendas', unidade: 'un' })
      .select()
      .single()
    produtoId = produto!.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('id', fornecedorId)
    await supabase.from('clientes').delete().eq('id', clienteId)
    await supabase.from('produtos').delete().eq('id', produtoId)
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('cargas').delete().eq('fornecedor_id', fornecedorId)
  })

  it('criar carga soma a quantidade no estoque do produto', async () => {
    const supabase = createAdminClient()
    await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })

    expect(await estoqueAtual()).toBe(10)
  })

  it('editar carga ajusta o estoque pela diferença líquida', async () => {
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })

    await supabase.rpc('atualizar_carga_com_itens', {
      p_carga_id: cargaId,
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 4, valor_unitario: 5 }],
    })

    expect(await estoqueAtual()).toBe(4)
  })

  it('criar venda desconta o estoque', async () => {
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })

    const { data: vendaId, error } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: ['123'],
      p_vendedor: 'João',
      p_empresa: 'Empresa X',
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    })

    expect(error).toBeNull()
    expect(vendaId).toBeTruthy()
    expect(await estoqueAtual()).toBe(7)
  })

  it('bloqueia venda com quantidade maior que o estoque disponível, sem alterar o estoque', async () => {
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 5, valor_unitario: 5 }],
    })

    const { error } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 999, preco_unitario: 8 }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('Estoque insuficiente')
    expect(await estoqueAtual()).toBe(5)
  })

  it('editar venda ajusta o estoque pela diferença líquida', async () => {
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })
    const { data: vendaId } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    })
    expect(await estoqueAtual()).toBe(7)

    await supabase.rpc('atualizar_venda_com_itens', {
      p_venda_id: vendaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 6, preco_unitario: 8 }],
    })

    expect(await estoqueAtual()).toBe(4)
  })

  it('excluir venda após edição devolve a quantidade atualizada, não a original', async () => {
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })
    const { data: vendaId } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    })
    expect(await estoqueAtual()).toBe(7)

    await supabase.rpc('atualizar_venda_com_itens', {
      p_venda_id: vendaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 6, preco_unitario: 8 }],
    })
    expect(await estoqueAtual()).toBe(4)

    await supabase.rpc('deletar_venda_com_itens', { p_venda_id: vendaId })

    expect(await estoqueAtual()).toBe(10)
  })

  it('excluir venda devolve o estoque', async () => {
    const supabase = createAdminClient()
    const { data: cargaId } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })
    const { data: vendaId } = await supabase.rpc('criar_venda_com_itens', {
      p_carga_id: cargaId,
      p_cliente_id: clienteId,
      p_data: '2026-09-21',
      p_notas_fiscais: [],
      p_vendedor: null,
      p_empresa: null,
      p_tipo_comissao: 'isento',
      p_comissao_percentual: null,
      p_comissao_fixa: null,
      p_itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    })
    expect(await estoqueAtual()).toBe(7)

    await supabase.rpc('deletar_venda_com_itens', { p_venda_id: vendaId })

    expect(await estoqueAtual()).toBe(10)
  })
})
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/vendas-estoque-rpc.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_vendas.sql tests/vendas-estoque-rpc.test.ts
git commit -m "feat: add estoque field, vendas tables and atomic stock-adjusting functions"
```

---

### Task 2: Server Actions de Vendas

**Files:**
- Create: `actions/venda-actions.ts`
- Modify: `actions/carga-actions.ts` (adicionar `listClientesAtivos`), `lib/types/database.ts` (adicionar `estoque_atual` em `Produto`, e os tipos `Venda`, `ItemVenda`, `VendaComItens`, `VendaInput`)
- Test: `tests/venda-actions.test.ts`

**Interfaces:**
- Consumes: funções de banco da Task 1 (`criar_venda_com_itens`, `atualizar_venda_com_itens`, `deletar_venda_com_itens`); `ResultadoAcao<T>` de `lib/types/acao.ts`; `assertModuleAccess` de `lib/auth/assert-module-access.ts`.
- Produces: `listVendas(cargaId: string): Promise<VendaComItens[]>`, `createVenda(cargaId: string, input: VendaInput): Promise<ResultadoAcao<VendaComItens>>`, `updateVenda(id: string, cargaId: string, input: VendaInput): Promise<ResultadoAcao<VendaComItens>>`, `deleteVenda(id: string): Promise<ResultadoAcao<void>>`, `listClientesAtivos(): Promise<{ id: string; nome: string }[]>` — consumidos pela Task 4.

- [ ] **Step 1: Adicionar os tipos em `lib/types/database.ts`**

Adicione `estoque_atual: number` em `Produto` (não em `ProdutoInput` — não é editável pelo formulário manual). Adicione ao final do arquivo:

```ts
export type TipoComissao = 'percentual' | 'isento' | 'fixo' | 'misto'

export interface Venda {
  id: string
  carga_id: string
  cliente_id: string
  cliente_nome: string
  data: string
  notas_fiscais: string[]
  vendedor: string | null
  empresa: string | null
  tipo_comissao: TipoComissao
  comissao_percentual: number | null
  comissao_fixa: number | null
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
  tipo_comissao: TipoComissao
  comissao_percentual: number | null
  comissao_fixa: number | null
  itens: { produto_id: string; quantidade: number; preco_unitario: number }[]
}
```

- [ ] **Step 2: Escrever o teste `tests/venda-actions.test.ts` (TDD — vai falhar até o Step 4)**

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import { listVendas, createVenda, updateVenda, deleteVenda } from '@/actions/venda-actions'
import { listClientesAtivos } from '@/actions/carga-actions'
import type { VendaInput } from '@/lib/types/database'

vi.mock('@/lib/auth/get-current-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

const ADMIN_PROFILE = {
  profile: { id: 'test-admin', nome: 'Admin Teste', email: 'admin@teste.com', role_id: 'admin-role', ativo: true, created_at: '' },
  role: { id: 'admin-role', nome: 'Admin', is_system: true, permissions_locked: true, created_at: '' },
  permissions: ['dashboard', 'cargas', 'clientes', 'produtos', 'fornecedores', 'usuarios'] as const,
}

const DOCUMENTO_FORNECEDOR = '11144477735'
const DOCUMENTO_CLIENTE = '22233344456'
const CODIGO_PRODUTO = 'TESTE-VENDA-ACTION'

let fornecedorId: string
let clienteId: string
let produtoId: string
let cargaId: string

const VENDA_BASE: VendaInput = {
  cliente_id: '',
  data: '2026-09-21',
  notas_fiscais: ['NF-1', 'NF-2'],
  vendedor: 'João',
  empresa: 'Empresa X',
  tipo_comissao: 'percentual',
  comissao_percentual: 5,
  comissao_fixa: null,
  itens: [],
}

describe('venda-actions', () => {
  beforeAll(async () => {
    const supabase = createAdminClient()
    const { data: fornecedor } = await supabase
      .from('fornecedores')
      .insert({ tipo: 'pf', documento: DOCUMENTO_FORNECEDOR, nome: 'Fornecedor Teste Venda Actions' })
      .select()
      .single()
    fornecedorId = fornecedor!.id

    const { data: cliente } = await supabase
      .from('clientes')
      .insert({ tipo: 'pf', documento: DOCUMENTO_CLIENTE, nome: 'Cliente Teste Venda Actions' })
      .select()
      .single()
    clienteId = cliente!.id

    const { data: produto } = await supabase
      .from('produtos')
      .insert({ codigo: CODIGO_PRODUTO, nome: 'Produto Teste Venda Actions', unidade: 'un' })
      .select()
      .single()
    produtoId = produto!.id
  })

  afterAll(async () => {
    const supabase = createAdminClient()
    await supabase.from('fornecedores').delete().eq('id', fornecedorId)
    await supabase.from('clientes').delete().eq('id', clienteId)
    await supabase.from('produtos').delete().eq('id', produtoId)
  })

  beforeEach(async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(ADMIN_PROFILE as never)
    const supabase = createAdminClient()
    const { data } = await supabase.rpc('criar_carga_com_itens', {
      p_fornecedor_id: fornecedorId,
      p_nome: 'Carga Teste',
      p_data: '2026-09-20',
      p_itens: [{ produto_id: produtoId, quantidade: 10, valor_unitario: 5 }],
    })
    cargaId = data
  })

  afterEach(async () => {
    const supabase = createAdminClient()
    await supabase.from('cargas').delete().eq('id', cargaId)
  })

  it('lista clientes ativos', async () => {
    const clientes = await listClientesAtivos()
    expect(clientes.some((c) => c.id === clienteId)).toBe(true)
  })

  it('cria, lista, atualiza e exclui uma venda', async () => {
    const input: VendaInput = {
      ...VENDA_BASE,
      cliente_id: clienteId,
      itens: [{ produto_id: produtoId, quantidade: 3, preco_unitario: 8 }],
    }

    const criada = await createVenda(cargaId, input)
    expect(criada.sucesso).toBe(true)
    if (!criada.sucesso) throw new Error('esperava sucesso')
    expect(criada.dados.notas_fiscais).toEqual(['NF-1', 'NF-2'])
    expect(criada.dados.itens).toHaveLength(1)

    const lista = await listVendas(cargaId)
    expect(lista.some((v) => v.id === criada.dados.id)).toBe(true)

    const atualizada = await updateVenda(criada.dados.id, cargaId, {
      ...input,
      itens: [{ produto_id: produtoId, quantidade: 5, preco_unitario: 8 }],
    })
    expect(atualizada.sucesso).toBe(true)
    if (!atualizada.sucesso) throw new Error('esperava sucesso')
    expect(atualizada.dados.itens[0].quantidade).toBe(5)

    const excluida = await deleteVenda(criada.dados.id)
    expect(excluida.sucesso).toBe(true)

    const listaFinal = await listVendas(cargaId)
    expect(listaFinal.some((v) => v.id === criada.dados.id)).toBe(false)
  })

  it('bloqueia venda com estoque insuficiente, devolvendo a mensagem do banco', async () => {
    const resultado = await createVenda(cargaId, {
      ...VENDA_BASE,
      cliente_id: clienteId,
      itens: [{ produto_id: produtoId, quantidade: 999, preco_unitario: 8 }],
    })

    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) throw new Error('esperava falha')
    expect(resultado.erro).toContain('Estoque insuficiente')
  })

  it('rejeita chamadas de um usuário sem permissão de cargas', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...ADMIN_PROFILE, permissions: ['dashboard'] } as never)

    await expect(listVendas(cargaId)).rejects.toThrow('Acesso negado.')
    await expect(listClientesAtivos()).rejects.toThrow('Acesso negado.')
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/venda-actions.test.ts`
Expected: FAIL — `Cannot find module '@/actions/venda-actions'` (e `listClientesAtivos` ainda não existe em `carga-actions.ts`).

- [ ] **Step 4: Adicionar `listClientesAtivos` em `actions/carga-actions.ts`**

Logo abaixo de `listFornecedoresAtivos`:

```ts
export async function listClientesAtivos(): Promise<{ id: string; nome: string }[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')
  if (error) throw new Error(error.message)
  return data ?? []
}
```

- [ ] **Step 5: Criar `actions/venda-actions.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertModuleAccess } from '@/lib/auth/assert-module-access'
import type { ResultadoAcao } from '@/lib/types/acao'
import type { VendaComItens, VendaInput } from '@/lib/types/database'

function paraVendaComItens(row: {
  id: string
  carga_id: string
  cliente_id: string
  clientes: { nome: string } | null
  data: string
  notas_fiscais: string[]
  vendedor: string | null
  empresa: string | null
  tipo_comissao: VendaComItens['tipo_comissao']
  comissao_percentual: number | null
  comissao_fixa: number | null
  itens_venda: {
    id: string
    produto_id: string
    quantidade: number
    preco_unitario: number
    produtos: { codigo: string; nome: string; unidade: string } | null
  }[]
}): VendaComItens {
  return {
    id: row.id,
    carga_id: row.carga_id,
    cliente_id: row.cliente_id,
    cliente_nome: row.clientes?.nome ?? '',
    data: row.data,
    notas_fiscais: row.notas_fiscais,
    vendedor: row.vendedor,
    empresa: row.empresa,
    tipo_comissao: row.tipo_comissao,
    comissao_percentual: row.comissao_percentual,
    comissao_fixa: row.comissao_fixa,
    itens: row.itens_venda.map((item) => ({
      id: item.id,
      produto_id: item.produto_id,
      produto_codigo: item.produtos?.codigo ?? '',
      produto_nome: item.produtos?.nome ?? '',
      produto_unidade: item.produtos?.unidade ?? '',
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
    })),
  }
}

const SELECT_VENDA_COM_ITENS =
  '*, clientes(nome), itens_venda(id, produto_id, quantidade, preco_unitario, produtos(codigo, nome, unidade))'

export async function listVendas(cargaId: string): Promise<VendaComItens[]> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('vendas_carga')
    .select(SELECT_VENDA_COM_ITENS)
    .eq('carga_id', cargaId)
    .order('data', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => paraVendaComItens(row as never))
}

export async function createVenda(cargaId: string, input: VendaInput): Promise<ResultadoAcao<VendaComItens>> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()

  const { data: vendaId, error } = await supabase.rpc('criar_venda_com_itens', {
    p_carga_id: cargaId,
    p_cliente_id: input.cliente_id,
    p_data: input.data,
    p_notas_fiscais: input.notas_fiscais,
    p_vendedor: input.vendedor,
    p_empresa: input.empresa,
    p_tipo_comissao: input.tipo_comissao,
    p_comissao_percentual: input.comissao_percentual,
    p_comissao_fixa: input.comissao_fixa,
    p_itens: input.itens,
  })

  if (error) {
    if (error.code === '23505') return { sucesso: false, erro: 'Não é possível adicionar o mesmo produto duas vezes na venda.' }
    return { sucesso: false, erro: error.message }
  }

  const { data: venda, error: buscaError } = await supabase
    .from('vendas_carga')
    .select(SELECT_VENDA_COM_ITENS)
    .eq('id', vendaId)
    .single()

  if (buscaError) return { sucesso: false, erro: buscaError.message }
  return { sucesso: true, dados: paraVendaComItens(venda as never) }
}

export async function updateVenda(
  id: string,
  cargaId: string,
  input: VendaInput
): Promise<ResultadoAcao<VendaComItens>> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()

  const { error } = await supabase.rpc('atualizar_venda_com_itens', {
    p_venda_id: id,
    p_cliente_id: input.cliente_id,
    p_data: input.data,
    p_notas_fiscais: input.notas_fiscais,
    p_vendedor: input.vendedor,
    p_empresa: input.empresa,
    p_tipo_comissao: input.tipo_comissao,
    p_comissao_percentual: input.comissao_percentual,
    p_comissao_fixa: input.comissao_fixa,
    p_itens: input.itens,
  })

  if (error) {
    if (error.code === '23505') return { sucesso: false, erro: 'Não é possível adicionar o mesmo produto duas vezes na venda.' }
    return { sucesso: false, erro: error.message }
  }

  const { data: venda, error: buscaError } = await supabase
    .from('vendas_carga')
    .select(SELECT_VENDA_COM_ITENS)
    .eq('id', id)
    .eq('carga_id', cargaId)
    .single()

  if (buscaError) return { sucesso: false, erro: 'Venda não encontrada.' }
  return { sucesso: true, dados: paraVendaComItens(venda as never) }
}

export async function deleteVenda(id: string): Promise<ResultadoAcao<void>> {
  await assertModuleAccess('cargas')
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('deletar_venda_com_itens', { p_venda_id: id })
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, dados: undefined }
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/venda-actions.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 7: Commit**

```bash
git add actions/venda-actions.ts actions/carga-actions.ts lib/types/database.ts tests/venda-actions.test.ts
git commit -m "feat: add Server Actions for vendas (list/create/update/delete)"
```

---

### Task 3: Resumo da carga com Vendido e Lucro

**Files:**
- Modify: `lib/cargas/resumo.ts`, `components/cargas/carga-resumo-cards.tsx`
- Test: `tests/resumo-carga.test.ts`

**Interfaces:**
- Consumes: nenhuma nova (só os tipos já existentes).
- Produces: `ResumoCarga` ganha `vendido: number` e `lucro: number`; `calcularResumoCarga` ganha um 4º parâmetro `vendas` — consumido pela Task 4 na página de detalhe da carga.

- [ ] **Step 1: Adicionar os novos casos de teste em `tests/resumo-carga.test.ts`**

Adicione ao final do arquivo, antes do `})` final de `describe`:

```ts
  it('retorna vendido e lucro zerados quando não há vendas', () => {
    const resumo = calcularResumoCarga([{ produto_id: 'p1', quantidade: 4, valor_unitario: 2.5 }], [], [], [])
    expect(resumo.vendido).toBe(0)
    expect(resumo.lucro).toBe(0)
  })

  it('calcula vendido e lucro com comissão isenta', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendas = [
      {
        tipo_comissao: 'isento' as const,
        comissao_percentual: null,
        comissao_fixa: null,
        itens: [{ produto_id: 'p1', quantidade: 4, preco_unitario: 5 }],
      },
    ]
    const resumo = calcularResumoCarga(itens, [], [], vendas)
    expect(resumo.vendido).toBe(20)
    expect(resumo.lucro).toBe(12)
  })

  it('calcula comissão percentual, fixa e mista corretamente', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendaPercentual = {
      tipo_comissao: 'percentual' as const,
      comissao_percentual: 10,
      comissao_fixa: null,
      itens: [{ produto_id: 'p1', quantidade: 1, preco_unitario: 100 }],
    }
    const vendaFixa = {
      tipo_comissao: 'fixo' as const,
      comissao_percentual: null,
      comissao_fixa: 15,
      itens: [{ produto_id: 'p1', quantidade: 1, preco_unitario: 100 }],
    }
    const vendaMista = {
      tipo_comissao: 'misto' as const,
      comissao_percentual: 10,
      comissao_fixa: 15,
      itens: [{ produto_id: 'p1', quantidade: 1, preco_unitario: 100 }],
    }

    expect(calcularResumoCarga(itens, [], [], [vendaPercentual]).lucro).toBe(300 - 10 - 2)
    expect(calcularResumoCarga(itens, [], [], [vendaFixa]).lucro).toBe(100 - 15 - 2)
    expect(calcularResumoCarga(itens, [], [], [vendaMista]).lucro).toBe(100 - 25 - 2)
  })

  it('comissão isento ignora comissao_percentual/comissao_fixa mesmo se vierem preenchidos por engano', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendas = [
      {
        tipo_comissao: 'isento' as const,
        comissao_percentual: 50,
        comissao_fixa: 999,
        itens: [{ produto_id: 'p1', quantidade: 4, preco_unitario: 5 }],
      },
    ]
    const resumo = calcularResumoCarga(itens, [], [], vendas)
    expect(resumo.vendido).toBe(20)
    expect(resumo.lucro).toBe(12)
  })

  it('venda de um produto que não está nos itens da carga entra com custo zero, sem quebrar', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendas = [
      {
        tipo_comissao: 'isento' as const,
        comissao_percentual: null,
        comissao_fixa: null,
        itens: [{ produto_id: 'produto-que-nao-esta-na-carga', quantidade: 2, preco_unitario: 10 }],
      },
    ]
    const resumo = calcularResumoCarga(itens, [], [], vendas)
    expect(resumo.vendido).toBe(20)
    expect(resumo.lucro).toBe(20)
  })

  it('desconta custos extras do lucro', () => {
    const itens = [{ produto_id: 'p1', quantidade: 10, valor_unitario: 2 }]
    const vendas = [
      {
        tipo_comissao: 'isento' as const,
        comissao_percentual: null,
        comissao_fixa: null,
        itens: [{ produto_id: 'p1', quantidade: 4, preco_unitario: 5 }],
      },
    ]
    const resumo = calcularResumoCarga(itens, [{ valor: 3 }], [], vendas)
    expect(resumo.lucro).toBe(9)
  })
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/resumo-carga.test.ts`
Expected: FAIL — `calcularResumoCarga` ainda não aceita o 4º parâmetro, e os testes antigos (que chamam com 3 args) continuam passando mas os novos vão quebrar por tipo/undefined.

- [ ] **Step 3: Implementar em `lib/cargas/resumo.ts`**

```ts
export interface ResumoCarga {
  custoTotal: number
  custosExtras: number
  pago: number
  falta: number
  vendido: number
  lucro: number
}

interface ItemVendaParaResumo {
  produto_id: string
  quantidade: number
  preco_unitario: number
}

interface VendaParaResumo {
  tipo_comissao: 'percentual' | 'isento' | 'fixo' | 'misto'
  comissao_percentual: number | null
  comissao_fixa: number | null
  itens: ItemVendaParaResumo[]
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

function somar(valores: number[]): number {
  return valores.reduce((soma, valor) => soma + valor, 0)
}

function comissaoDaVenda(venda: VendaParaResumo, totalVenda: number): number {
  if (venda.tipo_comissao === 'isento') return 0

  let valor = 0
  if (venda.tipo_comissao === 'percentual' || venda.tipo_comissao === 'misto') {
    valor += totalVenda * ((venda.comissao_percentual ?? 0) / 100)
  }
  if (venda.tipo_comissao === 'fixo' || venda.tipo_comissao === 'misto') {
    valor += venda.comissao_fixa ?? 0
  }
  return valor
}

export function calcularResumoCarga(
  itens: { produto_id?: string; quantidade: number; valor_unitario: number }[],
  custos: { valor: number }[],
  pagamentos: { valor: number }[],
  vendas: VendaParaResumo[] = []
): ResumoCarga {
  const custoTotal = centavos(somar(itens.map((item) => item.quantidade * item.valor_unitario)))
  const custosExtras = centavos(somar(custos.map((custo) => custo.valor)))
  const pago = centavos(somar(pagamentos.map((pagamento) => pagamento.valor)))

  const vendido = centavos(
    somar(vendas.flatMap((venda) => venda.itens.map((item) => item.quantidade * item.preco_unitario)))
  )

  const comissoes = centavos(
    somar(
      vendas.map((venda) => {
        const totalVenda = somar(venda.itens.map((item) => item.quantidade * item.preco_unitario))
        return comissaoDaVenda(venda, totalVenda)
      })
    )
  )

  const custoVendido = centavos(
    somar(
      vendas.flatMap((venda) =>
        venda.itens.map((item) => {
          const itemCarga = itens.find((i) => i.produto_id === item.produto_id)
          return item.quantidade * (itemCarga?.valor_unitario ?? 0)
        })
      )
    )
  )

  const lucro = centavos(vendido - custoVendido - comissoes - custosExtras)

  return { custoTotal, custosExtras, pago, falta: centavos(custoTotal - pago), vendido, lucro }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/resumo-carga.test.ts`
Expected: PASS — todos os testes (os 6 antigos continuam passando sem alterar a assinatura deles, já que `vendas` é opcional).

- [ ] **Step 5: Adicionar os cards em `components/cargas/carga-resumo-cards.tsx`**

```ts
import { formatarMoeda } from '@/lib/formatacao'
import type { ResumoCarga } from '@/lib/cargas/resumo'

export function CargaResumoCards({ resumo }: { resumo: ResumoCarga }) {
  const pagoAMais = resumo.falta < 0
  const prejuizo = resumo.lucro < 0

  const cartoes = [
    { rotulo: 'Custo total', valor: formatarMoeda(resumo.custoTotal), alerta: false },
    { rotulo: 'Custos extras', valor: formatarMoeda(resumo.custosExtras), alerta: false },
    { rotulo: 'Pago', valor: formatarMoeda(resumo.pago), alerta: false },
    {
      rotulo: pagoAMais ? 'Pago a mais' : 'Falta pagar',
      valor: formatarMoeda(Math.abs(resumo.falta)),
      alerta: pagoAMais,
    },
    { rotulo: 'Vendido', valor: formatarMoeda(resumo.vendido), alerta: false },
    {
      rotulo: prejuizo ? 'Prejuízo' : 'Lucro',
      valor: formatarMoeda(Math.abs(resumo.lucro)),
      alerta: prejuizo,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cartoes.map((cartao) => (
        <div
          key={cartao.rotulo}
          className={`rounded-2xl border p-4 ${
            cartao.alerta ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
          }`}
        >
          <p className={`text-xs ${cartao.alerta ? 'text-amber-700' : 'text-slate-500'}`}>{cartao.rotulo}</p>
          <p className={`mt-1 text-lg font-semibold ${cartao.alerta ? 'text-amber-900' : 'text-slate-900'}`}>
            {cartao.valor}
          </p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Rodar `npx tsc --noEmit` e confirmar que está limpo**

- [ ] **Step 7: Commit**

```bash
git add lib/cargas/resumo.ts components/cargas/carga-resumo-cards.tsx tests/resumo-carga.test.ts
git commit -m "feat: add Vendido and Lucro to carga resumo"
```

---

### Task 4: Tela de Vendas (aba, seção, modal)

**Files:**
- Create: `components/cargas/vendas-secao.tsx`, `components/cargas/venda-modal.tsx`
- Modify: `components/cargas/carga-abas.tsx`, `app/(app)/cargas/[id]/page.tsx`

**Interfaces:**
- Consumes: `listVendas`, `createVenda`, `updateVenda`, `deleteVenda` de `actions/venda-actions.ts` (Task 2); `listClientesAtivos` de `actions/carga-actions.ts` (Task 2); `calcularResumoCarga` com o novo 4º parâmetro (Task 3); `VendaComItens`, `VendaInput`, `TipoComissao` de `lib/types/database.ts` (Task 2).
- Produces: nenhuma interface nova pra outras tasks — esta é a última task do plano.

Sem testes automatizados — UI pura, mesmo padrão de `custos-secao.tsx`/`custo-modal.tsx` (que também não têm teste dedicado). Verificação é manual no navegador ao final, mais `npx tsc --noEmit` e `npm run build`.

- [ ] **Step 1: Adicionar a aba em `components/cargas/carga-abas.tsx`**

```ts
export type AbaCarga = 'itens' | 'vendas' | 'custos' | 'pagamentos'

export const ABAS_CARGA: { chave: AbaCarga; rotulo: string }[] = [
  { chave: 'itens', rotulo: 'Itens' },
  { chave: 'vendas', rotulo: 'Vendas' },
  { chave: 'custos', rotulo: 'Custos' },
  { chave: 'pagamentos', rotulo: 'Pagamentos' },
]
```

(o resto do arquivo não muda — `CargaAbas` já itera sobre `ABAS_CARGA` genericamente.)

- [ ] **Step 2: Criar `components/cargas/venda-modal.tsx`**

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createVenda, updateVenda } from '@/actions/venda-actions'
import { formatarMoeda } from '@/lib/formatacao'
import type { TipoComissao, VendaComItens, VendaInput } from '@/lib/types/database'

export interface ProdutoDisponivelVenda {
  id: string
  codigo: string
  nome: string
  unidade: string
}

interface ItemVendaLocal {
  produto_id: string
  produto_codigo: string
  produto_nome: string
  produto_unidade: string
  quantidade: number
  preco_unitario: number
}

const ROTULOS_COMISSAO: Record<TipoComissao, string> = {
  percentual: 'Percentual',
  isento: 'Isento',
  fixo: 'Fixo',
  misto: 'Misto (fixo + percentual)',
}

export function VendaModal({
  open,
  onOpenChange,
  cargaId,
  venda,
  clientes,
  produtosDisponiveis,
  dataPadrao,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cargaId: string
  venda: VendaComItens | null
  clientes: { id: string; nome: string }[]
  produtosDisponiveis: ProdutoDisponivelVenda[]
  dataPadrao: string
}) {
  const router = useRouter()
  const [clienteId, setClienteId] = useState('')
  const [data, setData] = useState('')
  const [notasFiscais, setNotasFiscais] = useState<string[]>([])
  const [novaNota, setNovaNota] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [tipoComissao, setTipoComissao] = useState<TipoComissao>('isento')
  const [comissaoPercentual, setComissaoPercentual] = useState('')
  const [comissaoFixa, setComissaoFixa] = useState('')
  const [itens, setItens] = useState<ItemVendaLocal[]>([])
  const [produtoIdNovo, setProdutoIdNovo] = useState('')
  const [quantidadeNova, setQuantidadeNova] = useState('')
  const [precoNovo, setPrecoNovo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setClienteId(venda?.cliente_id ?? '')
    setData(venda?.data ?? dataPadrao)
    setNotasFiscais(venda?.notas_fiscais ?? [])
    setNovaNota('')
    setVendedor(venda?.vendedor ?? '')
    setEmpresa(venda?.empresa ?? '')
    setTipoComissao(venda?.tipo_comissao ?? 'isento')
    setComissaoPercentual(venda?.comissao_percentual != null ? String(venda.comissao_percentual) : '')
    setComissaoFixa(venda?.comissao_fixa != null ? String(venda.comissao_fixa) : '')
    setItens(
      venda?.itens.map((item) => ({
        produto_id: item.produto_id,
        produto_codigo: item.produto_codigo,
        produto_nome: item.produto_nome,
        produto_unidade: item.produto_unidade,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
      })) ?? []
    )
    setProdutoIdNovo('')
    setQuantidadeNova('')
    setPrecoNovo('')
    setError(null)
  }, [open, venda, dataPadrao])

  const produtosParaSelecionar = produtosDisponiveis.filter(
    (p) => !itens.some((item) => item.produto_id === p.id)
  )
  const total = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0)

  function handleAdicionarNota() {
    const nota = novaNota.trim()
    if (nota === '') return
    setNotasFiscais((atual) => [...atual, nota])
    setNovaNota('')
  }

  function handleRemoverNota(index: number) {
    setNotasFiscais((atual) => atual.filter((_, i) => i !== index))
  }

  function handleAdicionarItem() {
    const produto = produtosDisponiveis.find((p) => p.id === produtoIdNovo)
    const quantidadeNum = Number(quantidadeNova)
    const precoNum = Number(precoNovo)

    if (!produto) {
      setError('Selecione um produto.')
      return
    }
    if (quantidadeNova.trim() === '' || !(quantidadeNum > 0)) {
      setError('Informe uma quantidade válida, maior que zero.')
      return
    }
    if (precoNovo.trim() === '' || !Number.isFinite(precoNum) || precoNum < 0) {
      setError('Informe um preço unitário válido.')
      return
    }

    setError(null)
    setItens((atual) => [
      ...atual,
      {
        produto_id: produto.id,
        produto_codigo: produto.codigo,
        produto_nome: produto.nome,
        produto_unidade: produto.unidade,
        quantidade: quantidadeNum,
        preco_unitario: precoNum,
      },
    ])
    setProdutoIdNovo('')
    setQuantidadeNova('')
    setPrecoNovo('')
  }

  function handleRemoverItem(produtoId: string) {
    setItens((atual) => atual.filter((item) => item.produto_id !== produtoId))
  }

  function handleSalvar() {
    setError(null)

    if (!clienteId) {
      setError('Selecione o cliente.')
      return
    }
    if (itens.length === 0) {
      setError('Adicione pelo menos um produto à venda.')
      return
    }
    if ((tipoComissao === 'percentual' || tipoComissao === 'misto') && comissaoPercentual.trim() === '') {
      setError('Informe o percentual de comissão.')
      return
    }
    if ((tipoComissao === 'fixo' || tipoComissao === 'misto') && comissaoFixa.trim() === '') {
      setError('Informe o valor fixo de comissão.')
      return
    }

    const input: VendaInput = {
      cliente_id: clienteId,
      data,
      notas_fiscais: notasFiscais,
      vendedor: vendedor.trim() === '' ? null : vendedor,
      empresa: empresa.trim() === '' ? null : empresa,
      tipo_comissao: tipoComissao,
      comissao_percentual:
        tipoComissao === 'percentual' || tipoComissao === 'misto' ? Number(comissaoPercentual) : null,
      comissao_fixa: tipoComissao === 'fixo' || tipoComissao === 'misto' ? Number(comissaoFixa) : null,
      itens: itens.map(({ produto_id, quantidade, preco_unitario }) => ({ produto_id, quantidade, preco_unitario })),
    }

    startTransition(async () => {
      const resultado = venda ? await updateVenda(venda.id, cargaId, input) : await createVenda(cargaId, input)

      if (!resultado.sucesso) {
        setError(resultado.erro)
        return
      }

      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>{venda ? 'Editar venda' : 'Nova venda'}</DialogTitle>
        <div className="mt-4 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-cliente">Cliente</Label>
              <select
                id="venda-cliente"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-data">Data</Label>
              <Input id="venda-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="venda-nf">Notas fiscais</Label>
            <div className="flex gap-2">
              <Input
                id="venda-nf"
                value={novaNota}
                onChange={(e) => setNovaNota(e.target.value)}
                placeholder="Número da NF"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAdicionarNota()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={handleAdicionarNota}>
                Adicionar
              </Button>
            </div>
            {notasFiscais.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {notasFiscais.map((nota, index) => (
                  <span
                    key={`${nota}-${index}`}
                    className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                  >
                    {nota}
                    <button type="button" onClick={() => handleRemoverNota(index)} className="text-slate-400 hover:text-slate-700">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-vendedor">Vendedor</Label>
              <Input id="venda-vendedor" value={vendedor} onChange={(e) => setVendedor(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-empresa">Empresa</Label>
              <Input id="venda-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <Label>Produtos</Label>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
              <div className="flex flex-col gap-1.5">
                <select
                  value={produtoIdNovo}
                  onChange={(e) => setProdutoIdNovo(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                >
                  <option value="">Selecione um produto...</option>
                  {produtosParaSelecionar.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Qtd."
                className="w-20"
                value={quantidadeNova}
                onChange={(e) => setQuantidadeNova(e.target.value)}
              />
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Preço"
                className="w-24"
                value={precoNovo}
                onChange={(e) => setPrecoNovo(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleAdicionarItem}>
                Adicionar
              </Button>
            </div>

            {itens.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2">Produto</th>
                    <th className="py-2">Qtd.</th>
                    <th className="py-2">Preço unit.</th>
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
                      <td className="py-2">{formatarMoeda(item.preco_unitario)}</td>
                      <td className="py-2">{formatarMoeda(item.quantidade * item.preco_unitario)}</td>
                      <td className="py-2 text-right">
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoverItem(item.produto_id)}>
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

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="venda-comissao">Tipo de comissão</Label>
              <select
                id="venda-comissao"
                value={tipoComissao}
                onChange={(e) => setTipoComissao(e.target.value as TipoComissao)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                {(Object.keys(ROTULOS_COMISSAO) as TipoComissao[]).map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ROTULOS_COMISSAO[tipo]}
                  </option>
                ))}
              </select>
            </div>

            {(tipoComissao === 'percentual' || tipoComissao === 'misto') && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="venda-comissao-percentual">Comissão (%)</Label>
                <Input
                  id="venda-comissao-percentual"
                  type="number"
                  step="any"
                  min="0"
                  value={comissaoPercentual}
                  onChange={(e) => setComissaoPercentual(e.target.value)}
                />
              </div>
            )}

            {(tipoComissao === 'fixo' || tipoComissao === 'misto') && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="venda-comissao-fixa">Comissão fixa (R$)</Label>
                <Input
                  id="venda-comissao-fixa"
                  type="number"
                  step="any"
                  min="0"
                  value={comissaoFixa}
                  onChange={(e) => setComissaoFixa(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSalvar} disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Criar `components/cargas/vendas-secao.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteVenda } from '@/actions/venda-actions'
import { formatarData, formatarMoeda } from '@/lib/formatacao'
import { VendaModal, type ProdutoDisponivelVenda } from './venda-modal'
import type { VendaComItens } from '@/lib/types/database'

export function VendasSecao({
  cargaId,
  vendas,
  clientes,
  produtosDisponiveis,
  dataPadrao,
}: {
  cargaId: string
  vendas: VendaComItens[]
  clientes: { id: string; nome: string }[]
  produtosDisponiveis: ProdutoDisponivelVenda[]
  dataPadrao: string
}) {
  const router = useRouter()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<VendaComItens | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrirNova() {
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(venda: VendaComItens) {
    setEditando(venda)
    setModalAberto(true)
  }

  function handleExcluir(venda: VendaComItens) {
    if (!window.confirm(`Excluir a venda para ${venda.cliente_nome} de ${formatarData(venda.data)}?`)) return
    setError(null)
    startTransition(async () => {
      const resultado = await deleteVenda(venda.id)
      if (!resultado.sucesso) {
        setError(resultado.erro)
        return
      }
      router.refresh()
    })
  }

  function totalVenda(venda: VendaComItens): number {
    return venda.itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">Vendas feitas a partir dos produtos desta carga.</p>
        <Button type="button" onClick={abrirNova}>
          Nova venda
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {vendas.length === 0 ? (
        <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
          Nenhuma venda registrada ainda.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Data</th>
              <th className="py-2">Cliente</th>
              <th className="py-2">NFs</th>
              <th className="py-2">Valor</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((venda) => (
              <tr key={venda.id} className="border-b">
                <td className="py-2">{formatarData(venda.data)}</td>
                <td className="py-2">{venda.cliente_nome}</td>
                <td className="py-2 text-slate-500">{venda.notas_fiscais.join(', ') || '—'}</td>
                <td className="py-2">{formatarMoeda(totalVenda(venda))}</td>
                <td className="py-2 text-right space-x-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => abrirEdicao(venda)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleExcluir(venda)}
                  >
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <VendaModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        cargaId={cargaId}
        venda={editando}
        clientes={clientes}
        produtosDisponiveis={produtosDisponiveis}
        dataPadrao={dataPadrao}
      />
    </div>
  )
}
```

- [ ] **Step 4: Conectar tudo em `app/(app)/cargas/[id]/page.tsx`**

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getCarga, listClientesAtivos, listProdutosAtivos } from '@/actions/carga-actions'
import { listCustos, listPagamentos } from '@/actions/carga-lancamentos-actions'
import { listVendas } from '@/actions/venda-actions'
import { calcularResumoCarga } from '@/lib/cargas/resumo'
import { formatarData } from '@/lib/formatacao'
import { buttonVariants } from '@/components/ui/button'
import { CargaResumoCards } from '@/components/cargas/carga-resumo-cards'
import { CargaAbas, ABAS_CARGA, type AbaCarga } from '@/components/cargas/carga-abas'
import { CargaItensTabela } from '@/components/cargas/carga-itens-tabela'
import { dataHojeSaoPaulo } from '@/lib/cargas/data-hoje'
import { CustosSecao } from '@/components/cargas/custos-secao'
import { PagamentosSecao } from '@/components/cargas/pagamentos-secao'
import { VendasSecao } from '@/components/cargas/vendas-secao'

export default async function CargaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aba?: string }>
}) {
  await requireModuleAccess('cargas')
  const { id } = await params
  const { aba } = await searchParams
  const abaAtiva: AbaCarga = ABAS_CARGA.some((a) => a.chave === aba) ? (aba as AbaCarga) : 'itens'

  const carga = await getCarga(id)
  if (!carga) {
    notFound()
  }

  const [custos, pagamentos, vendas, clientes, produtosAtivos] = await Promise.all([
    listCustos(id),
    listPagamentos(id),
    listVendas(id),
    listClientesAtivos(),
    listProdutosAtivos(),
  ])
  const resumo = calcularResumoCarga(carga.itens, custos, pagamentos, vendas)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{carga.nome}</h1>
            {!carga.ativo && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inativa</span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {carga.fornecedor_nome} · {formatarData(carga.data)}
          </p>
        </div>
        <Link href={`/cargas/${carga.id}/editar`} className={buttonVariants({ variant: 'outline' })}>
          Editar carga
        </Link>
      </div>

      <CargaResumoCards resumo={resumo} />

      <div className="space-y-4">
        <CargaAbas cargaId={carga.id} ativa={abaAtiva} />
        {abaAtiva === 'itens' && <CargaItensTabela itens={carga.itens} />}
        {abaAtiva === 'vendas' && (
          <VendasSecao
            cargaId={carga.id}
            vendas={vendas}
            clientes={clientes}
            produtosDisponiveis={produtosAtivos}
            dataPadrao={dataHojeSaoPaulo()}
          />
        )}
        {abaAtiva === 'custos' && (
          <CustosSecao cargaId={carga.id} custos={custos} dataPadrao={dataHojeSaoPaulo()} />
        )}
        {abaAtiva === 'pagamentos' && (
          <PagamentosSecao cargaId={carga.id} pagamentos={pagamentos} dataPadrao={dataHojeSaoPaulo()} />
        )}
      </div>
    </div>
  )
}
```

`listProdutosAtivos` já existe em `actions/carga-actions.ts` e devolve `{ id, codigo, nome, unidade }[]` — mesmo formato de `ProdutoDisponivelVenda`, não precisa de adaptação.

- [ ] **Step 5: Rodar `npx tsc --noEmit` e `npm run build`, confirmar que ambos ficam limpos**

- [ ] **Step 6: Verificação manual no navegador**

Com o servidor rodando (`npm run dev`), abrir uma carga existente, ir na aba "Vendas", criar uma venda com: cliente, data, duas notas fiscais, vendedor, empresa, dois produtos, e cada tipo de comissão (testar pelo menos Isento e Misto). Conferir que os cards "Vendido" e "Lucro" atualizam, que o estoque do produto (visível em algum lugar — se não houver tela de estoque ainda, conferir direto no Supabase) desce, e que tentar vender mais do que o estoque disponível é bloqueado com mensagem clara.

- [ ] **Step 7: Commit**

```bash
git add components/cargas/vendas-secao.tsx components/cargas/venda-modal.tsx components/cargas/carga-abas.tsx "app/(app)/cargas/[id]/page.tsx"
git commit -m "feat: add Vendas tab to carga detail page"
```
