import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | undefined;

export function gemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en el servidor.");
  return (client ??= new GoogleGenAI({ apiKey }));
}

/** Traduce los errores de la API a mensajes que se puedan accionar. */
export function explainGeminiError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("free_tier") && msg.includes("limit: 0")) {
    return "Google dice que este proyecto no tiene facturación activa: los modelos de imagen no tienen plan gratis. Vinculá una cuenta de facturación al proyecto de la API key.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    return "Google devolvió límite de uso (429). Esperá un momento y probá de nuevo.";
  }
  if (msg.includes("SAFETY") || msg.includes("blocked")) {
    return "El modelo bloqueó la imagen por sus filtros de seguridad. Probá reformular el prompt.";
  }
  return msg.slice(0, 300);
}
