"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { MAX_UPLOAD_BYTES, deleteImage, saveImage, sniffImage } from "@/lib/storage";
import { SVG_TYPE, looksLikeSvg, svgProblem } from "@/lib/svg";

const kinds = ["logo", "app_screenshot", "other"] as const;

function back(error: string): never {
  redirect(`/assets?error=${encodeURIComponent(error)}`);
}

export async function uploadAssets(formData: FormData) {
  await requireUser();
  const kind = z.enum(kinds).parse(formData.get("kind"));
  const usageNote = String(formData.get("usage_note") ?? "").slice(0, 500);
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) back("Elegí al menos una imagen.");

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) back(`${file.name} pesa más de 4 MB.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let type = sniffImage(bytes);
    if (!type && looksLikeSvg(bytes)) {
      const problem = svgProblem(bytes);
      if (problem) back(`${file.name}: ${problem}.`);
      type = SVG_TYPE;
    }
    if (!type) back(`${file.name} no es un PNG, JPEG, WebP o SVG válido.`);

    let url: string;
    try {
      url = await saveImage("assets", file.name, bytes, type);
    } catch (e) {
      back(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    }
    await query(
      "insert into app_flyers.assets (kind, name, url, usage_note) values ($1, $2, $3, $4)",
      [kind, file.name, url, usageNote],
    );
  }
  revalidatePath("/assets");
  redirect("/assets");
}

export async function updateAssetNote(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const note = String(formData.get("usage_note") ?? "").slice(0, 500);
  await query("update app_flyers.assets set usage_note = $1 where id = $2", [note, id]);
  revalidatePath("/assets");
}

export async function deleteAsset(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const { rows } = await query<{ url: string }>("delete from app_flyers.assets where id = $1 returning url", [id]);
  if (rows[0]) {
    try {
      await deleteImage(rows[0].url);
    } catch {
      // el registro ya se borró; si el archivo queda huérfano en Blob no rompe nada
    }
  }
  revalidatePath("/assets");
}
