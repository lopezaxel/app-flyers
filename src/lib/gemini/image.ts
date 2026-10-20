import { gemini } from "./client";
import { IMAGE_MODELS, imageCostUsd, type AspectRatio, type ImageSize, type ImageTier } from "./models";

export type RefImage = { mimeType: string; bytes: Uint8Array };

export type GeneratedImage = {
  bytes: Buffer;
  mimeType: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/** Genera una imagen. `refs` son logos, capturas de la app y referencias de estilo, en ese orden. */
export async function generateImage(params: {
  tier: ImageTier;
  prompt: string;
  aspectRatio: AspectRatio;
  size: ImageSize;
  refs: RefImage[];
}): Promise<GeneratedImage> {
  const model = IMAGE_MODELS[params.tier];
  const res = await gemini().models.generateContent({
    model: model.id,
    contents: [
      {
        role: "user",
        parts: [
          ...params.refs.map((r) => ({
            inlineData: { mimeType: r.mimeType, data: Buffer.from(r.bytes).toString("base64") },
          })),
          { text: params.prompt },
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: params.aspectRatio, imageSize: params.size },
    },
  });

  const candidate = res.candidates?.[0];
  const image = candidate?.content?.parts?.find((p) => p.inlineData?.data);
  if (!image?.inlineData?.data) {
    throw new Error(`El modelo no devolvió imagen (motivo: ${candidate?.finishReason ?? "desconocido"}).`);
  }

  const inputTokens = res.usageMetadata?.promptTokenCount ?? 0;
  return {
    bytes: Buffer.from(image.inlineData.data, "base64"),
    mimeType: image.inlineData.mimeType ?? "image/png",
    inputTokens,
    outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
    costUsd: imageCostUsd(params.tier, params.size, inputTokens),
  };
}
