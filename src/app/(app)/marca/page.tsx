import { FileTextarea } from "../file-textarea";
import { saveBrand } from "./actions";
import { query } from "@/lib/db";

type Brand = {
  body_md: string;
  rules_md: string;
  product_status_md: string;
  product_knowledge_md: string;
  palette: { hex: string; name: string; use: string }[];
};

export default async function MarcaPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const { rows } = await query<Brand>(
    "select body_md, rules_md, product_status_md, product_knowledge_md, palette from app_flyers.brand where id = 1",
  );
  const brand = rows[0];
  const paletteText = brand.palette.map((c) => `${c.hex} | ${c.name} | ${c.use}`).join("\n");

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Biblia de marca</h1>
        <p className="mt-1 text-sm text-white/60">
          Todo esto viaja automáticamente en cada generación. Podés escribir directo o cargar un
          archivo .md en cada campo.
        </p>
      </div>

      {saved && (
        <p role="status" className="glass px-4 py-2.5 text-sm">
          Guardado.
        </p>
      )}

      <form action={saveBrand} className="glass flex flex-col gap-6 p-6">
        <FileTextarea
          name="body_md"
          label="Marca y producto"
          hint="Qué es la app, para quién, tono, identidad visual, descripción del isotipo, prompt base."
          defaultValue={brand.body_md}
          rows={16}
        />
        <FileTextarea
          name="rules_md"
          label="Reglas duras"
          hint="Qué NO usar visualmente y qué NO mostrar ni prometer. Se envían como restricciones."
          defaultValue={brand.rules_md}
          rows={10}
        />
        <FileTextarea
          name="product_status_md"
          label="Estado actual del producto"
          hint="Qué se puede decir hoy y qué todavía no. Actualizalo cuando cambie algo."
          defaultValue={brand.product_status_md}
          rows={6}
        />
        <FileTextarea
          name="product_knowledge_md"
          label="Conocimiento del producto"
          hint="Para quién es, qué hace cada pantalla y botón, qué se puede afirmar y qué no. La parte comercial es la base de los flyers; la técnica (stack, despliegue) está en su propia sección y solo sirve para tener criterio: nunca aparece en un flyer."
          defaultValue={brand.product_knowledge_md}
          rows={14}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Paleta</span>
          <p className="text-xs text-white/50">
            Una línea por color: <code className="font-mono">#hex | nombre | uso</code>
          </p>
          <textarea
            name="palette"
            rows={6}
            defaultValue={paletteText}
            className="field font-mono text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {brand.palette.map((c) => (
              <span
                key={c.hex}
                className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs"
              >
                <span className="size-3 rounded-full border border-white/30" style={{ background: c.hex }} />
                {c.name || c.hex}
              </span>
            ))}
          </div>
        </div>
        <button className="btn self-start px-6">Guardar</button>
      </form>
    </>
  );
}
