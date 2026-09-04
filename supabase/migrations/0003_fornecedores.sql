-- Registra 'fornecedores' como module_key válido
alter table role_permissions drop constraint role_permissions_module_key_check;
alter table role_permissions add constraint role_permissions_module_key_check
  check (module_key in ('dashboard','cargas','clientes','produtos','fornecedores','usuarios'));

-- Concede o módulo ao Admin, mesmo padrão do seed original em 0001_fundacao.sql
insert into role_permissions (role_id, module_key)
select id, 'fornecedores'
from roles
where nome = 'Admin';

-- Tabela de fornecedores, estrutura idêntica a clientes
create table fornecedores (
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

alter table fornecedores enable row level security;

create policy "fornecedores_select_com_acesso"
  on fornecedores for select using (has_module_access('fornecedores'));

create policy "fornecedores_insert_com_acesso"
  on fornecedores for insert with check (has_module_access('fornecedores'));

create policy "fornecedores_update_com_acesso"
  on fornecedores for update using (has_module_access('fornecedores'));
