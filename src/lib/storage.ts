import { del, get, put } from "@vercel/blob";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type ImageType = { mime: string; ext: string };

/** Detecta el tipo real por los primeros bytes; el MIME que manda el navegador no es confiable. */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (startsWith([0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  const isWebp =
    startsWith([0x52, 0x49, 0x46, 0x46]) && [0x57, 0x45, 0x42, 0x50].every((b, i) => bytes[8 + i] === b);
  if (isWebp) return { mime: "image/webp", ext: "webp" };
  return null;
}

function assertConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Falta BLOB_READ_WRITE_TOKEN: todavía no está conectado el almacenamiento de imágenes.");
  }
}

export async function saveImage(folder: string, name: string, bytes: Uint8Array, type: ImageType) {
  assertConfigured();
  const safe = name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "imagen";
  // El store es privado: la URL guardada no abre en el navegador, se lee con `readImage`.
  const blob = await put(`${folder}/${safe}.${type.ext}`, Buffer.from(bytes), {
    access: "private",
    addRandomSuffix: true,
    contentType: type.mime,
  });
  return blob.url;
}

/** Lee una imagen del store privado. Devuelve null si ya no existe. */
export async function readImage(url: string) {
  assertConfigured();
  const res = await get(url, { access: "private" });
  if (!res || res.statusCode !== 200) return null;
  return { stream: res.stream, contentType: res.blob.contentType };
}

export async function readImageBytes(url: string) {
  const img = await readImage(url);
  if (!img) return null;
  return new Uint8Array(await new Response(img.stream).arrayBuffer());
}

export async function deleteImage(url: string) {
  assertConfigured();
  await del(url);
}
