import { query } from "./db";

export type MonthUsage = {
  spentUsd: number;
  capUsd: number;
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
};

export async function getMonthUsage(): Promise<MonthUsage> {
  const [usage, settings] = await Promise.all([
    query<{ spent: string; tin: string; tout: string; imgs: string }>(
      `select coalesce(sum(cost_usd), 0) as spent,
              coalesce(sum(input_tokens), 0) as tin,
              coalesce(sum(output_tokens), 0) as tout,
              coalesce(sum(image_count), 0) as imgs
       from app_flyers.usage_log
       where created_at >= date_trunc('month', now())`,
    ),
    query<{ monthly_cap_usd: string }>("select monthly_cap_usd from app_flyers.settings where id = 1"),
  ]);
  const u = usage.rows[0];
  return {
    spentUsd: Number(u.spent),
    capUsd: Number(settings.rows[0]?.monthly_cap_usd ?? 15),
    inputTokens: Number(u.tin),
    outputTokens: Number(u.tout),
    imageCount: Number(u.imgs),
  };
}
