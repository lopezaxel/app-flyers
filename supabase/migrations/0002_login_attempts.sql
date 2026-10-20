-- Límite de intentos de login (compartido entre instancias serverless).
create table app_flyers.login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index on app_flyers.login_attempts (ip, at desc);

alter table app_flyers.login_attempts enable row level security;
create policy flyers_app_all on app_flyers.login_attempts for all to flyers_app using (true) with check (true);
grant select, insert, delete on app_flyers.login_attempts to flyers_app;
