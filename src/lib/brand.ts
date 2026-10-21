import { query } from "./db";

export type Brand = {
  body_md: string;
  rules_md: string;
  product_status_md: string;
  /** Conocimiento interno del producto (funciones, seguridad, límites, stack) para evaluar ideas. */
  product_knowledge_md: string;
  palette: { hex: string; name: string; use: string }[];
};

export async function getBrand(): Promise<Brand> {
  const { rows } = await query<Brand>(
    "select body_md, rules_md, product_status_md, product_knowledge_md, palette from app_flyers.brand where id = 1",
  );
  return rows[0];
}
