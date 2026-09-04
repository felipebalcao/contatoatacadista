create table cargas (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id),
  nome text not null,
  data date not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table itens_carga (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade numeric not null check (quantidade > 0),
  valor_unitario numeric not null check (valor_unitario >= 0),
  created_at timestamptz not null default now(),
  unique (carga_id, produto_id)
);

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

create or replace function criar_carga_com_itens(
  p_fornecedor_id uuid,
  p_nome text,
  p_data date,
  p_itens jsonb
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
