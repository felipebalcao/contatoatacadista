create table roles (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  is_system boolean not null default false,
  permissions_locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  role_id uuid not null references roles(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  module_key text not null check (module_key in ('dashboard','cargas','clientes','produtos','usuarios')),
  primary key (role_id, module_key)
);

alter table roles enable row level security;
alter table profiles enable row level security;
alter table role_permissions enable row level security;

create or replace function current_role_id()
returns uuid
language sql
security definer
stable
as $$
  select role_id from profiles where id = auth.uid();
$$;

create or replace function has_module_access(module text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from role_permissions
    where role_id = current_role_id() and module_key = module
  );
$$;

create policy "profiles_select_own_or_admin"
  on profiles for select
  using (id = auth.uid() or has_module_access('usuarios'));

create policy "profiles_insert_admin"
  on profiles for insert with check (has_module_access('usuarios'));

create policy "profiles_update_admin"
  on profiles for update using (has_module_access('usuarios'));

create policy "profiles_delete_admin"
  on profiles for delete using (has_module_access('usuarios'));

create policy "roles_select_admin"
  on roles for select using (has_module_access('usuarios'));

create policy "roles_insert_admin"
  on roles for insert with check (has_module_access('usuarios'));

create policy "roles_update_admin"
  on roles for update using (has_module_access('usuarios') and is_system = false)
  with check (is_system = false);

create policy "roles_delete_admin"
  on roles for delete using (has_module_access('usuarios') and is_system = false);

create policy "role_permissions_select_admin"
  on role_permissions for select using (has_module_access('usuarios'));

create policy "role_permissions_insert_admin"
  on role_permissions for insert with check (
    has_module_access('usuarios')
    and not exists (select 1 from roles where id = role_id and permissions_locked)
  );

create policy "role_permissions_delete_admin"
  on role_permissions for delete using (
    has_module_access('usuarios')
    and not exists (select 1 from roles where id = role_id and permissions_locked)
  );

insert into roles (nome, is_system, permissions_locked) values
  ('Admin', true, true),
  ('Financeiro', true, false);

insert into role_permissions (role_id, module_key)
select id, module_key
from roles, unnest(array['dashboard','cargas','clientes','produtos','usuarios']) as module_key
where nome = 'Admin';
