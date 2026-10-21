import type { AngleOption, CoverageNote } from "./chat-types";
import { query } from "./db";

// "Hoy" y "ayer" se cuentan con el día de Salta, no con el del servidor (UTC).
const TZ = "America/Argentina/Salta";
const DISABLED = /\[(ESPERAR|más adelante)\]/i;

export type AngleStat = AngleOption & { yesterday: number; lastAt: string | null };
export type AngleStats = { angles: AngleStat[]; unassigned: number };

/** Cuántos flyers terminados hay por ángulo: en total, hoy, ayer y cuándo fue el último. */
export async function getAngleStats(): Promise<AngleStats> {
  const [angles, unassigned] = await Promise.all([
    query<{ id: string; name: string; total: number; today: number; yesterday: number; last_at: Date | null }>(
      `with f as (
         select angle_id, created_at, (created_at at time zone '${TZ}')::date as day
         from app_flyers.flyers where status = 'done'
       ), today as (select (now() at time zone '${TZ}')::date as d)
       select a.id, a.name,
              count(f.angle_id)::int as total,
              count(f.angle_id) filter (where f.day = (select d from today))::int as today,
              count(f.angle_id) filter (where f.day = (select d from today) - 1)::int as yesterday,
              max(f.created_at) as last_at
       from app_flyers.angles a
       left join f on f.angle_id = a.id
       group by a.id, a.name, a.sort, a.created_at
       order by a.sort, a.created_at`,
    ),
    query<{ n: number }>("select count(*)::int as n from app_flyers.flyers where status = 'done' and angle_id is null"),
  ]);
  return {
    angles: angles.rows.map((r) => ({
      id: r.id,
      name: r.name,
      total: r.total,
      today: r.today,
      yesterday: r.yesterday,
      lastAt: r.last_at ? r.last_at.toISOString() : null,
      enabled: !DISABLED.test(r.name),
    })),
    unassigned: unassigned.rows[0].n,
  };
}

const dayMonth = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: TZ });

/** Resumen en texto para el director: lo lee en cada turno para poder responder y sugerir. */
export function coverageText(stats: AngleStats) {
  const lines = stats.angles.map((a) => {
    const counts =
      a.total === 0
        ? "todavía ninguno"
        : `${a.total} en total (${a.today} hoy, ${a.yesterday} ayer, último el ${dayMonth.format(new Date(a.lastAt!))})`;
    return `- ${a.name}: ${counts}${a.enabled ? "" : " [no habilitado por ahora: no sugerirlo]"}`;
  });
  if (stats.unassigned > 0) lines.push(`- Sin ángulo (libre): ${stats.unassigned} en total`);
  return lines.join("\n");
}

/** Nota fija que se muestra en la propuesta cuando el usuario eligió un ángulo. */
export function coverageNote(angleId: string, stats: AngleStats): CoverageNote | undefined {
  const angle = stats.angles.find((a) => a.id === angleId);
  if (!angle) return undefined;
  return {
    angleName: angle.name,
    total: angle.total,
    today: angle.today,
    yesterday: angle.yesterday,
    lastAt: angle.lastAt,
    untouched: stats.angles.filter((a) => a.enabled && a.total === 0 && a.id !== angleId).map((a) => a.name),
  };
}

/** Los ángulos tal como los usa el chat. */
export function toOptions(stats: AngleStats): AngleOption[] {
  return stats.angles.map(({ id, name, total, today, enabled }) => ({ id, name, total, today, enabled }));
}
