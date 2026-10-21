/** "T06 — Evento / convocatoria [ESPERAR]" → "T06 Evento / convocatoria" (sin la etiqueta de estado). */
export function angleLabel(name: string) {
  return name.replace(/\s*\[[^\]]*\]\s*$/, "").replace(" — ", " ");
}
