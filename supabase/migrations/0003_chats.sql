-- Chat de la sección Generar. Solo toca el schema app_flyers.
-- Aplicada en Supabase como "app_flyers_chats". Rollback:
--   drop table app_flyers.chat_messages; drop table app_flyers.chats;
--   (y volver el check de formato a '1:1','4:5','9:16')

create table app_flyers.chats (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nuevo chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on app_flyers.chats (updated_at desc);

create table app_flyers.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references app_flyers.chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on app_flyers.chat_messages (chat_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['chats', 'chat_messages'] loop
    execute format('alter table app_flyers.%I enable row level security', t);
    execute format('create policy flyers_app_all on app_flyers.%I for all to flyers_app using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on app_flyers.%I to flyers_app', t);
  end loop;
end $$;

-- Formatos horizontales además de los verticales.
alter table app_flyers.flyers drop constraint flyers_format_check;
alter table app_flyers.flyers add constraint flyers_format_check
  check (format in ('1:1', '4:5', '9:16', '16:9', '4:3', '3:4'));
