-- Los flyers propios que se eligen como modelo de estilo se guardan junto a las capturas de inspiración,
-- distinguidos por rol: 'inspiration' (referencia de composición y clima) o 'style' (modelo de estilo a respetar).
-- Aplicada en Supabase como "app_flyers_inspiration_role". Rollback:
--   alter table app_flyers.inspiration drop column role;
alter table app_flyers.inspiration
  add column role text not null default 'inspiration' check (role in ('inspiration', 'style'));
