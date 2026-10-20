import { deleteAsset, updateAssetNote, uploadAssets } from "./actions";
import { query } from "@/lib/db";

type Asset = { id: string; kind: string; name: string; url: string; usage_note: string };

const kindLabel: Record<string, string> = {
  logo: "Logo",
  app_screenshot: "Captura de la app",
  other: "Otro",
};

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { rows: assets } = await query<Asset>(
    "select id, kind, name, url, usage_note from app_flyers.assets order by kind, created_at desc",
  );

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Assets</h1>
        <p className="mt-1 text-sm text-white/60">
          Logos y capturas de la app que siempre están disponibles como referencia. PNG, JPEG o WebP,
          hasta 4 MB cada uno.
        </p>
      </div>

      {error && (
        <p role="alert" className="glass px-4 py-2.5 text-sm">
          {error}
        </p>
      )}

      <form action={uploadAssets} className="glass flex flex-col gap-4 p-6">
        <h2 className="font-medium">Subir</h2>
        <input type="file" name="files" accept="image/png,image/jpeg,image/webp" multiple required className="text-sm" />
        <div className="flex flex-col gap-3 sm:flex-row">
          <select name="kind" className="field sm:w-56" defaultValue="logo">
            <option value="logo">Logo</option>
            <option value="app_screenshot">Captura de la app</option>
            <option value="other">Otro</option>
          </select>
          <input
            name="usage_note"
            placeholder="Cuándo usarlo (ej. fondo oscuro, versión horizontal)"
            className="field flex-1"
          />
        </div>
        <button className="btn self-start px-6">Subir</button>
      </form>

      {assets.length === 0 ? (
        <p className="text-sm text-white/50">Todavía no hay assets.</p>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {assets.map((a) => (
            <article key={a.id} className="glass flex flex-col gap-3 p-4">
              <div
                className="flex h-40 items-center justify-center overflow-hidden rounded-xl bg-[repeating-conic-gradient(rgba(255,255,255,0.06)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.name} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span className="truncate">{a.name}</span>
                <span className="rounded-full border border-white/15 px-2 py-0.5">{kindLabel[a.kind]}</span>
              </div>
              <form action={updateAssetNote} className="flex gap-2">
                <input type="hidden" name="id" value={a.id} />
                <input name="usage_note" defaultValue={a.usage_note} placeholder="Cuándo usarlo" className="field text-sm" />
                <button className="btn-ghost">Guardar</button>
              </form>
              <form action={deleteAsset}>
                <input type="hidden" name="id" value={a.id} />
                <button className="text-xs text-white/50 underline hover:text-white">Borrar</button>
              </form>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
