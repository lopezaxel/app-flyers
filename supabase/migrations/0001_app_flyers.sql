-- app-flyers: schema aislado dentro del proyecto Supabase compartido.
-- Solo CREA objetos nuevos. No altera, lee ni referencia ninguna tabla existente
-- (public.*, auth.*, storage.*). No se expone por la API REST/Realtime.

create schema if not exists app_flyers;
revoke all on schema app_flyers from public, anon, authenticated;

-- Rol propio, sin permisos fuera de app_flyers. La contraseña la seteás vos
-- (ver README), nunca va en este archivo.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'flyers_app') then
    create role flyers_app login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;

grant usage on schema app_flyers to flyers_app;

create table app_flyers.brand (
  id int primary key default 1 check (id = 1),
  body_md text not null default '',
  rules_md text not null default '',
  product_status_md text not null default '',
  palette jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table app_flyers.settings (
  id int primary key default 1 check (id = 1),
  monthly_cap_usd numeric(10,2) not null default 15
);

create table app_flyers.assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('logo','app_screenshot','other')),
  name text not null,
  url text not null,
  usage_note text not null default '',
  created_at timestamptz not null default now()
);

create table app_flyers.angles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instructions_md text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_flyers.inspiration (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table app_flyers.flyers (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references app_flyers.flyers(id) on delete set null,
  series_id uuid,
  angle_id uuid references app_flyers.angles(id) on delete set null,
  topic text not null default '',
  copy jsonb not null default '{}',
  format text not null check (format in ('1:1','4:5','9:16')),
  model text not null,
  resolution text not null default '1K',
  prompt text not null default '',
  ref_inspiration_ids uuid[] not null default '{}',
  ref_flyer_ids uuid[] not null default '{}',
  image_url text,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  cost_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
create index on app_flyers.flyers (created_at desc);
create index on app_flyers.flyers (series_id);

create table app_flyers.usage_log (
  id uuid primary key default gen_random_uuid(),
  flyer_id uuid references app_flyers.flyers(id) on delete set null,
  kind text not null check (kind in ('copy','prompt','image')),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  image_count int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
create index on app_flyers.usage_log (created_at desc);

insert into app_flyers.brand (id) values (1);
insert into app_flyers.settings (id) values (1);

-- RLS: activado en todo, con una única policy para flyers_app.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'app_flyers' loop
    execute format('alter table app_flyers.%I enable row level security', t);
    execute format('create policy flyers_app_all on app_flyers.%I for all to flyers_app using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on app_flyers.%I to flyers_app', t);
  end loop;
end $$;

-- Rollback completo (no toca nada más):
--   drop schema app_flyers cascade;
--   drop role flyers_app;
