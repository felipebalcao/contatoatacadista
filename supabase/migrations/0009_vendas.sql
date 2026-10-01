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
