-- Conocimiento interno del producto, para que el director creativo evalúe ideas contra la realidad de CAEIA.
-- Aplicada en Supabase como "app_flyers_brand_product_knowledge". Rollback:
--   alter table app_flyers.brand drop column product_knowledge_md;
alter table app_flyers.brand add column product_knowledge_md text not null default '';
