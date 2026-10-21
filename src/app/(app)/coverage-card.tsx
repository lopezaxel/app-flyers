import { angleLabel } from "@/lib/angle-label";
import { getAngleStats } from "@/lib/angle-stats";

const dateFmt = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Salta" });

/** Tablero de cobertura: cuántos flyers lleva cada ángulo y cuáles todavía no se tocaron. */
export async function CoverageCard() {
  const { angles, unassigned } = await getAngleStats();
  if (angles.length === 0) return null;

  const active = angles.filter((a) => a.enabled);
  const waiting = angles.filter((a) => !a.enabled);
  const max = Math.max(1, ...angles.map((a) => a.total));
  const untouched = active.filter((a) => a.total === 0);
  const total = angles.reduce((sum, a) => sum + a.total, 0) + unassigned;

  return (
    <section className="glass p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm uppercase tracking-[0.2em] text-white/60">Cobertura por ángulo</h2>
        <p className="font-mono text-sm text-white/80">{total} flyers</p>
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {active.map((a) => (
          <li key={a.id} className="grid grid-cols-[minmax(0,15rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-white/85" title={angleLabel(a.name)}>
              {angleLabel(a.name)}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-white" style={{ width: `${(a.total / max) * 100}%` }} />
            </span>
            <span className="w-56 text-right font-mono text-xs text-white/55">
              {a.total === 0
                ? "sin flyers"
                : [
                    `${a.total} ${a.total === 1 ? "flyer" : "flyers"}`,
                    a.today > 0 && `${a.today} hoy`,
                    a.yesterday > 0 && `${a.yesterday} ayer`,
                    `últ. ${dateFmt.format(new Date(a.lastAt!))}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-white/70">
        {untouched.length > 0 ? (
          <>
            <span className="text-white/90">Todavía sin flyers:</span> {untouched.map((a) => angleLabel(a.name)).join(" · ")}.
          </>
        ) : (
          "Todos los ángulos habilitados tienen al menos un flyer."
        )}
      </p>
      {(waiting.length > 0 || unassigned > 0) && (
        <p className="mt-1 text-xs text-white/45">
          {waiting.length > 0 && <>En espera (no cuentan como faltantes): {waiting.map((a) => angleLabel(a.name)).join(" · ")}. </>}
          {unassigned > 0 && <>Sin ángulo: {unassigned}.</>}
        </p>
      )}
    </section>
  );
}
