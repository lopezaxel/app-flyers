"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

const angleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Falta el nombre").max(200),
  instructions_md: z.string().max(50_000),
});

export async function saveAngle(formData: FormData) {
  await requireUser();
  const raw = Object.fromEntries(formData);
  const data = angleSchema.parse({ ...raw, id: raw.id || undefined });
  if (data.id) {
    await query(
      "update app_flyers.angles set name = $1, instructions_md = $2, updated_at = now() where id = $3",
      [data.name, data.instructions_md, data.id],
    );
  } else {
    await query(
      `insert into app_flyers.angles (name, instructions_md, sort)
       values ($1, $2, coalesce((select max(sort) + 1 from app_flyers.angles), 0))`,
      [data.name, data.instructions_md],
    );
  }
  revalidatePath("/angulos");
}

export async function deleteAngle(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  await query("delete from app_flyers.angles where id = $1", [id]);
  revalidatePath("/angulos");
}

/** Parte un .md en ángulos: cada encabezado `##` (o `#` si no hay `##`) es un ángulo. */
export async function importAngles(formData: FormData) {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > 1_000_000) throw new Error("El archivo es demasiado grande.");

  const text = (await file.text()).replace(/\r\n/g, "\n");
  const level = /^## /m.test(text) ? "##" : "#";
  const parts = text.split(new RegExp(`^${level} `, "m")).slice(1);

  for (const part of parts) {
    const [title, ...rest] = part.split("\n");
    const name = title.trim().slice(0, 200);
    if (!name) continue;
    await query(
      `insert into app_flyers.angles (name, instructions_md, sort)
       values ($1, $2, coalesce((select max(sort) + 1 from app_flyers.angles), 0))`,
      [name, rest.join("\n").trim()],
    );
  }
  revalidatePath("/angulos");
}
