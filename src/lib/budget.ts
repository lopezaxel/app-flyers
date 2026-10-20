import { query } from "./db";
import { getMonthUsage } from "./usage";

export class BudgetError extends Error {}

/** Corta antes de gastar si la generación estimada hace pasar el tope mensual. */
export async function assertWithinBudget(estimatedUsd: number) {
  const { spentUsd, capUsd } = await getMonthUsage();
  if (spentUsd + estimatedUsd > capUsd) {
    throw new BudgetError(
      `Pasarías el tope mensual: llevás US$ ${spentUsd.toFixed(2)} de ${capUsd.toFixed(2)} y esta generación costaría ~US$ ${estimatedUsd.toFixed(2)}. Subí el tope en Ajustes o esperá al mes que viene.`,
    );
  }
}

export async function logUsage(entry: {
  flyerId?: string | null;
  kind: "copy" | "prompt" | "image";
  model: string;
  inputTokens: number;
  outputTokens: number;
  imageCount?: number;
  costUsd: number;
}) {
  await query(
    `insert into app_flyers.usage_log (flyer_id, kind, model, input_tokens, output_tokens, image_count, cost_usd)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.flyerId ?? null,
      entry.kind,
      entry.model,
      entry.inputTokens,
      entry.outputTokens,
      entry.imageCount ?? 0,
      entry.costUsd,
    ],
  );
}
