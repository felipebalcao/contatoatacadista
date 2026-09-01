create table clientes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pf', 'pj')),
  documento text not null unique,
  nome text not null,
  nome_fantasia text,
  telefone text,
  email text,
  endereco_rua text,
  endereco_numero text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_uf text,
  endereco_cep text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table clientes enable row level security;

create policy "clientes_select_com_acesso"
  on clientes for select using (has_module_access('clientes'));

create policy "clientes_insert_com_acesso"
  on clientes for insert with check (has_module_access('clientes'));

create policy "clientes_update_com_acesso"
  on clientes for update using (has_module_access('clientes'));
