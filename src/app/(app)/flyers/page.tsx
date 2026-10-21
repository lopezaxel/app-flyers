import Link from "next/link";
import { query } from "@/lib/db";
import { ImageLightbox } from "../image-lightbox";

type Flyer = {
  id: string;
  series_id: string | null;
  topic: string;
  copy: { headline?: string; caption?: string; name?: string; approach?: string };
  format: string;
  resolution: string;
  image_url: string | null;
  status: "pending" | "done" | "failed";
  cost_usd: string;
  created_at: Date;
  angle_name: string | null;
};

const statusLabel = { pending: "Pendiente", done: "Listo", failed: "Falló" };
const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

export default async function FlyersPage({
  searchParams,
}: {
  searchParams: Promise<{ serie?: string }>;
}) {
  const { serie } = await searchParams;
  const { rows: flyers } = await query<Flyer>(
    `select f.id, f.series_id, f.topic, f.copy, f.format, f.resolution, f.image_url, f.status, f.cost_usd, f.created_at,
            a.name as angle_name
     from app_flyers.flyers f
     left join app_flyers.angles a on a.id = f.angle_id
     order by f.created_at desc
     limit 60`,
  );

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Flyers</h1>
          <p className="mt-1 text-sm text-white/60">Historial de lo generado, del más nuevo al más viejo.</p>
        </div>
        <Link href="/generar" className="btn px-5">
          Generar
        </Link>
      </div>

      {flyers.length === 0 ? (
        <p className="text-sm text-white/50">Todavía no generaste ningún flyer.</p>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {flyers.map((f) => (
            <article
              key={f.id}
              className={`glass flex flex-col gap-3 p-4 ${serie && f.series_id === serie ? "ring-2 ring-white/60" : ""}`}
            >
              {f.image_url ? (
                <ImageLightbox
                  src={`/api/img/flyer/${f.id}`}
                  alt={f.copy.headline ?? f.topic}
                  downloadHref={`/api/img/flyer/${f.id}?download=1`}
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-white/5 text-sm text-white/50">
                  {statusLabel[f.status]}
                </div>
              )}
              <div>
                <p className="font-medium">{f.copy.headline ?? f.topic}</p>
                <p className="mt-0.5 text-xs text-white/50">
                  {f.copy.name ? `${f.copy.name} · ` : ""}
                  {f.angle_name ?? "Sin ángulo"} · {f.format} · {f.resolution}
                </p>
              </div>
              {f.copy.caption && (
                <details className="text-sm text-white/70">
                  <summary className="cursor-pointer text-xs text-white/50">Texto del posteo</summary>
                  <p className="mt-2 whitespace-pre-wrap">{f.copy.caption}</p>
                </details>
              )}
              <p className="font-mono text-xs text-white/40">
                {dateFmt.format(f.created_at)} · US$ {Number(f.cost_usd).toFixed(3)} · {statusLabel[f.status]}
              </p>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
