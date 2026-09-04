create table produtos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  codigo_barras text,
  nome text not null,
  unidade text not null,
  categoria text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table produtos enable row level security;

create policy "produtos_select_com_acesso"
  on produtos for select using (has_module_access('produtos'));

create policy "produtos_insert_com_acesso"
  on produtos for insert with check (has_module_access('produtos'));

create policy "produtos_update_com_acesso"
  on produtos for update using (has_module_access('produtos'));
