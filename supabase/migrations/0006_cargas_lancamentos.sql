create table custos_carga (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  categoria text not null,
  descricao text,
  valor numeric not null check (valor > 0),
  data date not null,
  created_at timestamptz not null default now()
);

create table pagamentos_carga (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas(id) on delete cascade,
  data date not null,
  valor numeric not null check (valor > 0),
  observacao text,
  created_at timestamptz not null default now()
);

alter table custos_carga enable row level security;
alter table pagamentos_carga enable row level security;

create policy "custos_carga_select_com_acesso"
  on custos_carga for select using (has_module_access('cargas'));

create policy "custos_carga_insert_com_acesso"
  on custos_carga for insert with check (has_module_access('cargas'));

create policy "custos_carga_update_com_acesso"
  on custos_carga for update using (has_module_access('cargas'));

create policy "custos_carga_delete_com_acesso"
  on custos_carga for delete using (has_module_access('cargas'));

create policy "pagamentos_carga_select_com_acesso"
  on pagamentos_carga for select using (has_module_access('cargas'));

create policy "pagamentos_carga_insert_com_acesso"
  on pagamentos_carga for insert with check (has_module_access('cargas'));

create policy "pagamentos_carga_update_com_acesso"
  on pagamentos_carga for update using (has_module_access('cargas'));

create policy "pagamentos_carga_delete_com_acesso"
  on pagamentos_carga for delete using (has_module_access('cargas'));
