import type { MonthUsage } from "@/lib/usage";

const fmt = new Intl.NumberFormat("es-AR");

export function SpendBar({ usage }: { usage: MonthUsage }) {
  const pct = Math.min(100, (usage.spentUsd / usage.capUsd) * 100);
  return (
    <section className="glass p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-[0.2em] text-white/60">Gasto del mes</h2>
        <p className="font-mono text-sm text-white/80">
          US$ {usage.spentUsd.toFixed(2)} / {usage.capUsd.toFixed(2)}
        </p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 font-mono text-xs text-white/50">
        {fmt.format(usage.inputTokens)} tokens entrada · {fmt.format(usage.outputTokens)} tokens
        salida · {usage.imageCount} imágenes
      </p>
    </section>
  );
}
