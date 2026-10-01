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
  v_estoque numeric;
begin
  for v_item in
    select (item->>'produto_id')::uuid as produto_id, (item->>'quantidade')::numeric as quantidade
    from jsonb_array_elements(p_itens) as item
  loop
    select estoque_atual into v_estoque from produtos where id = v_item.produto_id for update;

    if v_estoque is null then
      raise exception 'Produto não encontrado.';
    end if;

    if v_estoque < v_item.quantidade then
      raise exception 'Estoque insuficiente de %. Disponível: %, solicitado: %',
        (select nome from produtos where id = v_item.produto_id),
        v_estoque,
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
  v_estoque numeric;
begin
  update produtos p
  set estoque_atual = estoque_atual + iv.quantidade
  from itens_venda iv
  where iv.venda_id = p_venda_id and p.id = iv.produto_id;

  for v_item in
    select (item->>'produto_id')::uuid as produto_id, (item->>'quantidade')::numeric as quantidade
    from jsonb_array_elements(p_itens) as item
  loop
    select estoque_atual into v_estoque from produtos where id = v_item.produto_id for update;

    if v_estoque is null then
      raise exception 'Produto não encontrado.';
    end if;

    if v_estoque < v_item.quantidade then
      raise exception 'Estoque insuficiente de %. Disponível: %, solicitado: %',
        (select nome from produtos where id = v_item.produto_id),
        v_estoque,
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
