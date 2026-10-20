import { FileTextarea } from "../file-textarea";
import { deleteAngle, importAngles, saveAngle } from "./actions";
import { query } from "@/lib/db";

type Angle = { id: string; name: string; instructions_md: string };

export default async function AngulosPage() {
  const { rows: angles } = await query<Angle>(
    "select id, name, instructions_md from app_flyers.angles order by sort, created_at",
  );

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Ángulos</h1>
        <p className="mt-1 text-sm text-white/60">
          Cada ángulo es una plantilla editable (problema, confianza, conocer la app…). Al generar
          elegís uno y escribís el tema.
        </p>
      </div>

      <form action={importAngles} className="glass flex flex-wrap items-center gap-3 p-4">
        <div className="flex-1 text-sm">
          <p className="font-medium">Importar desde un .md</p>
          <p className="text-xs text-white/50">
            Cada encabezado <code className="font-mono">##</code> (o <code className="font-mono">#</code>) se
            convierte en un ángulo.
          </p>
        </div>
        <input type="file" name="file" accept=".md,.txt" required className="text-sm" />
        <button className="btn-ghost">Importar</button>
      </form>

      <section className="flex flex-col gap-3">
        {angles.length === 0 && (
          <p className="text-sm text-white/50">Todavía no hay ángulos. Importá un archivo o creá uno abajo.</p>
        )}
        {angles.map((a) => (
          <details key={a.id} className="glass group p-4">
            <summary className="cursor-pointer list-none font-medium">{a.name}</summary>
            <form action={saveAngle} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="id" value={a.id} />
              <input name="name" defaultValue={a.name} required className="field" />
              <FileTextarea name="instructions_md" label="Instrucciones" defaultValue={a.instructions_md} rows={10} />
              <div className="flex gap-3">
                <button className="btn px-5">Guardar</button>
                <button formAction={deleteAngle} className="btn-ghost" formNoValidate>
                  Borrar
                </button>
              </div>
            </form>
          </details>
        ))}
      </section>

      <form action={saveAngle} className="glass flex flex-col gap-4 p-6">
        <h2 className="font-medium">Nuevo ángulo</h2>
        <input name="name" placeholder="Nombre (ej. Problema)" required className="field" />
        <FileTextarea name="instructions_md" label="Instrucciones" rows={8} />
        <button className="btn self-start px-6">Crear</button>
      </form>
    </>
  );
}
