import sharp from "sharp";
import type { ImageType } from "./storage";

export const SVG_TYPE: ImageType = { mime: "image/svg+xml", ext: "svg" };
export const MAX_SVG_BYTES = 1024 * 1024;

// Un SVG es texto y puede traer código. Se rechaza todo lo que no hace falta para un logo
// (en vez de intentar limpiarlo): scripts, eventos, enlaces y recursos externos.
const FORBIDDEN: [RegExp, string][] = [
  [/<!DOCTYPE|<!ENTITY/i, "declaraciones DOCTYPE o ENTITY"],
  [/<\?(?!xml\s)/i, "instrucciones de procesamiento (por ejemplo xml-stylesheet)"],
  [/<\s*(script|foreignObject|iframe|embed|object|animate\w*|set|audio|video|canvas|link|handler)\b/i, "elementos activos (script, foreignObject, animaciones…)"],
  [/\bon[a-z]+\s*=/i, "atributos de eventos (onclick, onload…)"],
  [/(?:java|vb)script\s*:/i, "enlaces javascript:"],
  [/href\s*=\s*["']\s*(?!#)/i, "enlaces o recursos externos (href)"],
  [/url\(\s*["']?\s*(?!#)/i, "referencias url() externas"],
  [/@import/i, "@import en los estilos"],
];

// Las imágenes raster incrustadas (base64) sí valen; cualquier otro data: no.
const EMBEDDED_RASTER = /data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]*/gi;

/** ¿Empieza como un SVG? (opcional declaración xml y comentarios, después <svg). */
export function looksLikeSvg(bytes: Uint8Array) {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^﻿/, "");
  return /^\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head);
}

/** Devuelve el motivo del rechazo, o null si el SVG es seguro de guardar y servir. */
export function svgProblem(bytes: Uint8Array): string | null {
  if (bytes.length > MAX_SVG_BYTES) return "el SVG pesa más de 1 MB";
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "el SVG no está codificado en UTF-8";
  }
  const stripped = text.replace(EMBEDDED_RASTER, "#embedded-image");
  for (const [pattern, why] of FORBIDDEN) {
    if (pattern.test(stripped)) return `contiene ${why}, que no se permite por seguridad`;
  }
  if (!looksLikeSvg(bytes)) return "no es un SVG válido";
  return null;
}

/** Gemini no acepta SVG como imagen de referencia: se convierte a PNG, conservando la transparencia. */
export async function svgToPng(bytes: Uint8Array, opts: { maxSide?: number } = {}) {
  const problem = svgProblem(bytes);
  if (problem) throw new Error(`SVG rechazado: ${problem}`);
  const input = Buffer.from(bytes);
  const { width = 0, height = 0 } = await sharp(input).metadata();
  // El SVG se rasteriza a la densidad justa para que el lado mayor mida `maxSide` píxeles, nítido.
  const density = Math.min(1200, Math.max(36, (72 * (opts.maxSide ?? 1024)) / Math.max(width, height, 1)));
  return sharp(input, { density, limitInputPixels: 50_000_000 }).png().toBuffer();
}
