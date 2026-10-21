"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

const schema = z.object({
  body_md: z.string().max(100_000),
  rules_md: z.string().max(50_000),
  product_status_md: z.string().max(50_000),
  product_knowledge_md: z.string().max(60_000),
  palette: z.string().max(10_000),
});

/** Una línea por color: `#0ea5e9 | Azul eléctrico | Parte "CAE" del wordmark` */
async function parsePalette(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [hex = "", name = "", use = ""] = line.split("|").map((p) => p.trim());
      return { hex, name, use };
    })
    .filter((c) => /^#[0-9a-f]{3,8}$/i.test(c.hex));
}

export async function saveBrand(formData: FormData) {
  await requireUser();
  const data = schema.parse(Object.fromEntries(formData));
  const palette = await parsePalette(data.palette);
  await query(
    `update app_flyers.brand
     set body_md = $1, rules_md = $2, product_status_md = $3, product_knowledge_md = $4, palette = $5::jsonb, updated_at = now()
     where id = 1`,
    [data.body_md, data.rules_md, data.product_status_md, data.product_knowledge_md, JSON.stringify(palette)],
  );
  revalidatePath("/marca");
  redirect("/marca?saved=1");
}
