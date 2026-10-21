import { cookies } from "next/headers";
import { z } from "zod";
import { query } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { readImage } from "@/lib/storage";

const tables = {
  asset: { table: "app_flyers.assets", column: "url" },
  flyer: { table: "app_flyers.flyers", column: "image_url" },
  inspiration: { table: "app_flyers.inspiration", column: "url" },
} as const;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

/** Sirve imágenes del store privado de Blob, solo con sesión iniciada. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const store = await cookies();
  if (!(await verifySessionToken(store.get(SESSION_COOKIE)?.value))) {
    return new Response("No autorizado", { status: 401 });
  }

  const { kind, id } = await params;
  if (!(kind in tables)) return new Response("No encontrado", { status: 404 });
  if (!z.string().uuid().safeParse(id).success) return new Response("No encontrado", { status: 404 });

  const { table, column } = tables[kind as keyof typeof tables];
  const { rows } = await query<{ url: string | null }>(`select ${column} as url from ${table} where id = $1`, [id]);
  if (!rows[0]?.url) return new Response("No encontrado", { status: 404 });

  const img = await readImage(rows[0].url);
  if (!img) return new Response("No encontrado", { status: 404 });

  // Solo se sirven tipos de imagen conocidos; cualquier otra cosa se entrega como descarga.
  const known = ALLOWED_TYPES.has(img.contentType);
  // ?download=1 entrega el archivo como descarga, con un nombre legible.
  const download = new URL(req.url).searchParams.get("download") === "1";
  const ext = img.contentType.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") ?? "bin";
  return new Response(img.stream, {
    headers: {
      "Content-Type": known ? img.contentType : "application/octet-stream",
      ...(download || !known
        ? { "Content-Disposition": `attachment; filename="caeia-${kind}-${id.slice(0, 8)}.${known ? ext : "bin"}"` }
        : {}),
      // Si alguien abre un SVG directo en una pestaña, que no pueda ejecutar nada ni cargar recursos.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      // Cada imagen tiene una URL con sufijo aleatorio: el contenido de un id no cambia.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
