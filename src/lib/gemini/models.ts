// Precios en USD, verificados el 2026-10-20 en https://ai.google.dev/gemini-api/docs/pricing
// Cambian seguido: si Google los ajusta, se corrigen acá y nada más.

export type ImageTier = "draft" | "final";
export type ImageSize = "1K" | "2K" | "4K";
export type AspectRatio = "1:1" | "4:5" | "9:16";

export const IMAGE_MODELS: Record<
  ImageTier,
  { id: string; label: string; inputPerMillion: number; perImage: Record<ImageSize, number> }
> = {
  draft: {
    id: "gemini-nano-banana-2.1",
    label: "Borrador · Nano Banana 2.1",
    inputPerMillion: 1.5,
    perImage: { "1K": 0.0336, "2K": 0.0504, "4K": 0.113 },
  },
  final: {
    id: "gemini-3-pro-image",
    label: "Final · Nano Banana Pro",
    inputPerMillion: 2,
    perImage: { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
  },
};

// Director creativo (copys y prompt visual). Los precios suben el 2027-01-01 a 1.50 / 7.50.
export const TEXT_MODEL = {
  id: "gemini-3.8-flash",
  inputPerMillion: 0.75,
  outputPerMillion: 3.75,
};

export function imageCostUsd(tier: ImageTier, size: ImageSize, inputTokens: number) {
  const m = IMAGE_MODELS[tier];
  return m.perImage[size] + (inputTokens / 1_000_000) * m.inputPerMillion;
}

export function textCostUsd(inputTokens: number, outputTokens: number) {
  return (
    (inputTokens / 1_000_000) * TEXT_MODEL.inputPerMillion +
    (outputTokens / 1_000_000) * TEXT_MODEL.outputPerMillion
  );
}

/** Estimación previa a generar: supone ~4.000 tokens de entrada (prompt + imágenes de referencia). */
export function estimateImagesCostUsd(tier: ImageTier, size: ImageSize, count: number) {
  return imageCostUsd(tier, size, 4000) * count;
}
