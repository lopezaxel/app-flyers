import { ThinkingLevel } from "@google/genai";
import { z } from "zod";
import type { Brand } from "../brand";
import { gemini } from "./client";
import type { RefImage } from "./image";
import { TEXT_MODEL, textCostUsd } from "./models";

const conceptCoreSchema = z.object({
  name: z.string().min(1).max(80),
  approach: z.string().max(300),
  headline: z.string().min(1).max(120),
  subheadline: z.string().max(200),
  cta: z.string().max(60),
  caption: z.string().max(1500),
  visual_prompt: z.string().min(1).max(4000),
});

/** Variación tal como se guarda y se edita. `base_flyer_id` apunta al flyer anterior que refina, si lo hay. */
export const conceptSchema = conceptCoreSchema.extend({
  base_flyer_id: z.string().uuid().nullable().optional(),
  /** Cambios explícitos (en inglés) a aplicar sobre el flyer base. Opcional: las propuestas viejas no lo tienen. */
  changes_en: z.string().max(1500).nullable().optional(),
});
export type Concept = z.infer<typeof conceptSchema>;

/** Lo que devuelve el modelo: `based_on` es el número (1..n) del flyer generado que refina, o 0 si es un diseño nuevo. */
const directorConceptSchema = conceptCoreSchema.extend({
  based_on: z.number().int().min(0).max(8),
  changes_en: z.string().max(1500),
});
export type DirectorConcept = z.infer<typeof directorConceptSchema>;

const proposalSchema = z.object({
  mode: z.enum(["propose", "chat"]),
  reply: z.string().max(4000),
  title: z.string().max(80),
  analysis: z.object({
    summary: z.string().max(3000),
    adaptations: z.string().max(2000),
    tags: z.array(z.string().max(40)).max(12),
  }),
  variations: z.array(directorConceptSchema).max(6),
  restrictions_en: z.string().max(4000),
  assets_en: z.array(z.object({ name: z.string().max(200), description: z.string().max(400) })).max(12),
  assessment: z.object({
    applies: z.boolean(),
    verdict: z.enum(["fits", "adjust", "rethink"]),
    meaning: z.string().max(1200),
    reason: z.string().max(1200),
    recommendation: z.string().max(1200),
    recommended_angle: z.string().max(200),
    supports: z.array(z.string().max(300)).max(6),
    risks: z.array(z.string().max(400)).max(6),
  }),
});

export type Analysis = z.infer<typeof proposalSchema>["analysis"];
/** Evaluación estratégica de la idea del usuario contra el producto y la marca. */
export type Assessment = z.infer<typeof proposalSchema>["assessment"];
export type AssetNote = { name: string; description: string };

/** Turno previo de la conversación, ya resumido a texto. */
export type HistoryTurn = { role: "user" | "assistant"; text: string };

/** Flyer ya generado en este chat, que el director puede mirar. */
export type RecentFlyer = { name: string; headline: string; image: RefImage };

const conceptJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nombre corto de la variación (2 a 4 palabras)." },
    approach: { type: "string", description: "Una frase: en qué se diferencia esta variación de las otras." },
    headline: { type: "string", description: "Título corto e impactante que va escrito en el flyer." },
    subheadline: { type: "string", description: "Bajada opcional; vacía si no hace falta." },
    cta: { type: "string", description: "Llamado a la acción corto; vacío si no corresponde." },
    caption: { type: "string", description: "Texto para el posteo que acompaña al flyer (no va en la imagen)." },
    visual_prompt: {
      type: "string",
      description:
        "IN ENGLISH. Complete, detailed prompt for the image model: composition, camera/shot, objects, lighting, colors, typography and where each text goes. Any on-image text is quoted in its original Spanish, never translated.",
    },
    based_on: {
      type: "integer",
      description:
        "Número (1..n) del flyer generado que esta variación refina, o 0 si es un diseño nuevo. Siempre 0 si no hay flyers generados.",
    },
    changes_en: {
      type: "string",
      description:
        "IN ENGLISH. Only when based_on > 0: the explicit, concrete list of edits to apply to that flyer and nothing else (e.g. \"Make the CAEIA logo about twice as large. Make the headline noticeably bigger.\"). Empty string when based_on is 0.",
    },
  },
  required: ["name", "approach", "headline", "subheadline", "cta", "caption", "visual_prompt", "based_on", "changes_en"],
};

const responseJsonSchema = {
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: ["propose", "chat"],
      description: "\"propose\" si pide crear, rehacer o ajustar un flyer; \"chat\" si solo pregunta, consulta o pide una opinión.",
    },
    reply: {
      type: "string",
      description:
        "En modo propose: mensaje corto y cercano (2 a 4 oraciones) con qué entendiste y en qué se diferencian las variaciones, sin repetir los textos. En modo chat: la respuesta completa a la consulta.",
    },
    title: { type: "string", description: "Título del chat, de hasta 6 palabras, según el tema." },
    analysis: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "Lectura de las capturas de inspiración y del estilo de los flyers modelo: composición, jerarquía, estilo, paleta, tipografía y clima. Vacío si no hay capturas nuevas ni flyers de estilo, o si el modo es chat.",
        },
        adaptations: {
          type: "string",
          description: "Qué se ajustó de la referencia para respetar la marca. Vacío si no hizo falta.",
        },
        tags: { type: "array", items: { type: "string" }, description: "Etiquetas cortas del estilo de la referencia." },
      },
      required: ["summary", "adaptations", "tags"],
    },
    assessment: {
      type: "object",
      description:
        "Evaluación estratégica de la idea contra el producto real y la marca. applies=false (y el resto vacío) si es un ajuste menor sobre algo ya generado, una consulta (modo chat) o no hay idea nueva.",
      properties: {
        applies: { type: "boolean", description: "true si hay una idea o captura nuevas para evaluar." },
        verdict: {
          type: "string",
          enum: ["fits", "adjust", "rethink"],
          description: "fits: la idea es buena tal cual. adjust: buena base pero hay que corregir mensaje o enfoque. rethink: conviene cambiar de enfoque.",
        },
        meaning: {
          type: "string",
          description: "Qué comunica la captura más allá del estilo (metáfora, emoción, mensaje). Vacío si no hay captura.",
        },
        reason: {
          type: "string",
          description: "1 a 3 oraciones, directas y cercanas, con el dato concreto del producto que respalda o contradice la idea.",
        },
        recommendation: { type: "string", description: "El mensaje y enfoque que recomendás para este flyer." },
        recommended_angle: {
          type: "string",
          description: "Nombre EXACTO de un ángulo habilitado del catálogo, o cadena vacía si el elegido ya es el mejor.",
        },
        supports: {
          type: "array",
          items: { type: "string" },
          description: "Hechos concretos del producto que respaldan lo que se va a comunicar.",
        },
        risks: {
          type: "array",
          items: { type: "string" },
          description: "Afirmaciones de la idea que el producto no puede respaldar, cada una con su corrección.",
        },
      },
      required: ["applies", "verdict", "meaning", "reason", "recommendation", "recommended_angle", "supports", "risks"],
    },
    variations: { type: "array", items: conceptJsonSchema, description: "Vacío en modo chat." },
    restrictions_en: {
      type: "string",
      description:
        "IN ENGLISH. The brand's hard rules (visual and content) translated as a concise bullet list for the image model, phrased as things to avoid or respect. Empty in chat mode.",
    },
    assets_en: {
      type: "array",
      description: "IN ENGLISH. One short description per attached brand asset, with its usage note translated. Empty in chat mode.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The asset file name, exactly as given." },
          description: { type: "string" },
        },
        required: ["name", "description"],
      },
    },
  },
  required: ["mode", "reply", "title", "analysis", "assessment", "variations", "restrictions_en", "assets_en"],
};

export type ProposeInput = {
  brand: Brand;
  /** null = el usuario no eligió ángulo: el director elige el enfoque. */
  angle: { name: string; instructions_md: string } | null;
  topic: string;
  format: string;
  images: RefImage[];
  /** Flyers que el usuario eligió como modelo de estilo (subidos o ya generados). */
  style: RefImage[];
  count: number;
  assets: { name: string; kind: string; usage_note: string }[];
  history: HistoryTurn[];
  /** Flyers del último resultado del chat, para que el director los mire. */
  recent: RecentFlyer[];
  /** Cuántos flyers hay generados por ángulo (texto ya armado). */
  coverage: string;
  /** Catálogo de ángulos habilitados con su objetivo, para poder recomendar uno. */
  angleCatalog: string;
};

/**
 * Director creativo. Según el mensaje decide entre conversar (responder una consulta) o proponer `count`
 * variaciones con enfoques visuales distintos. Puede mirar las capturas nuevas y los flyers ya generados.
 */
export async function proposeVariations(input: ProposeInput) {
  const { brand, angle, topic, format, images, style, count, assets, history, recent, coverage, angleCatalog } = input;
  const palette = brand.palette.map((c) => `${c.hex} ${c.name}${c.use ? ` (${c.use})` : ""}`).join("; ");

  const system = [
    "Sos el director creativo de la marca y conversás con el usuario en un chat. Podés (a) responder consultas sobre sus flyers, referencias y decisiones creativas, o (b) proponer variaciones de un flyer y escribir el prompt visual de cada una para un modelo de generación de imágenes.",
    "Escribí el copy en español rioplatense salvo que la marca indique otra cosa.",
    `# Marca y producto\n${brand.body_md}`,
    `# Reglas duras (obligatorias)\n${brand.rules_md}`,
    `# Estado actual del producto (no prometas nada fuera de esto)\n${brand.product_status_md}`,
    brand.product_knowledge_md &&
      `# Conocimiento del producto (la parte comercial es la base de los flyers; la parte técnica es solo para tu criterio y NUNCA aparece en un flyer)\n${brand.product_knowledge_md}`,
    palette && `# Paleta\n${palette}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const conversation =
    history.length > 0
      ? `# Conversación previa (de la más antigua a la más reciente)\n${history
          .map((t) => `${t.role === "user" ? "Usuario" : "Asistente"}: ${t.text}`)
          .join("\n")}`
      : "";

  const instructions = [
    angle
      ? `# Ángulo: ${angle.name}\n${angle.instructions_md}`
      : "# Ángulo: libre\nEl usuario no eligió un ángulo: elegí vos el enfoque de comunicación más adecuado a su pedido y al estado del producto.",
    conversation,
    `# Cobertura de ángulos: cuántos flyers ya se generaron por ángulo\n${coverage}\nUsá estos números para (a) responder si el usuario pregunta qué ángulos hizo, cuántos flyers lleva o cuáles le faltan; y (b) en modo propose, si el usuario eligió un ángulo que ya tiene 4 o más flyers en total o 2 o más hoy, cerrar tu reply con una sugerencia breve y amable de probar otro ángulo habilitado que todavía tenga 0 (nombralo), sin insistir ni frenar el pedido: igual proponés las variaciones. No repitas todos los números en cada respuesta: la interfaz ya los muestra.`,
    `# Catálogo de ángulos habilitados (para recomendar el que mejor calza)\n${angleCatalog}`,
    `# Mensaje actual del usuario\n${topic}`,
    `# Formato\n${format}`,
    "# Primero decidí el modo",
    "mode = \"chat\" si el mensaje es una pregunta, consulta, opinión o pedido de explicación y NO pide crear ni cambiar un flyer (por ejemplo \"¿qué opinás de este?\", \"¿por qué elegiste ese enfoque?\", \"explicame esta referencia\"). En ese caso respondé en reply de forma útil y directa (podés extenderte), dejá variations vacío ([]), analysis con textos y tags vacíos, restrictions_en vacío y assets_en vacío; si te piden una opinión sobre un flyer generado, una captura o una idea, miralo y evaluála con el conocimiento del producto y la marca, con franqueza y de forma concreta (assessment con applies=false). mode =\"propose\" si pide crear, rehacer o ajustar un flyer: seguí las tareas de abajo.",
    "# Evaluación estratégica (en modo propose, cuando el mensaje trae una idea nueva o capturas nuevas)",
    "Antes de proponer, razoná como un estratega de marca que conoce el producto a fondo y le habla con franqueza a Axel, el dueño. Completá el campo assessment así:\n1. meaning: qué comunica la captura más allá del estilo (la metáfora, la emoción, el mensaje). Por ejemplo, un candado holográfico comunica seguridad y protección. Vacío si no hay captura.\n2. Compará la idea del usuario con el conocimiento interno del producto y el estado actual: ¿lo que quiere decir es verdad y tiene respaldo? Detectá promesas que el producto no puede cumplir, conceptos confusos o riesgosos, y datos que faltan.\n3. Buscá el mejor uso de esa idea o referencia para ESTA marca: el mensaje real y diferencial del producto que mejor transmite, y el ángulo del catálogo que le calza. Ejemplo: un candado puede transmitir \"nunca te pedimos tu clave fiscal\" (ángulo de confianza y seguridad), no \"tu usuario y contraseña están seguros acá\", que sería confuso y no es lo que hace CAEIA.\n4. verdict, con honestidad: \"fits\" si la idea es buena tal cual, \"adjust\" si es buena base pero hay que corregir el mensaje o el enfoque, \"rethink\" si conviene cambiar de enfoque. No halagues por cortesía: si la idea no es buena decilo con respeto y explicá por qué; si es buena decí por qué funciona.\n5. reason: 1 a 3 oraciones directas, con el dato concreto del producto que la respalda o la contradice. recommendation: el mensaje y enfoque que recomendás. recommended_angle: el nombre EXACTO de un ángulo habilitado del catálogo, o cadena vacía si el elegido ya es el mejor. supports: hechos concretos del producto que respaldan lo que vas a comunicar. risks: cada afirmación de la idea que no se puede respaldar, con su corrección.\n6. Las variaciones siguen tu recomendación. Si verdict no es \"fits\" y hay 2 o más variaciones, una de ellas respeta la idea original del usuario tal cual (llamala \"Tu idea original\") y las demás siguen tu recomendación; con una sola variación seguí la recomendación y explicá en reply por qué.\nSi el mensaje es solo un ajuste menor sobre algo ya generado, o una consulta, poné applies=false y dejá el resto vacío. Para la evaluación usá sobre todo la parte COMERCIAL del conocimiento (para quién es, funciones, pantallas y botones, qué se puede afirmar). La parte técnica sirve solo para saber qué es posible y no prometer algo imposible: nunca va, ni escrita ni dibujada, en un flyer.",
    "# Tareas del modo propose",
    history.length > 0
      ? "0. Si hay conversación previa, el mensaje actual puede ser un pedido de ajuste sobre las variaciones anteriores (por ejemplo \"más minimalista\", \"fondo violeta\", \"cambiá el titular\"): aplicalo y conservá lo que no pide cambiar. Si en cambio es una idea nueva, ignorá lo anterior."
      : "",
    recent.length > 0
      ? `0b. Arriba ves los flyers ya generados en este chat (#1 a #${recent.length}). El pedido puede referirse a ellos: mirálos para entender qué funcionó y qué falló (logo chico, texto cortado, composición, colores) y corregilo en el nuevo visual_prompt. En cada variación poné en based_on el número del flyer que estás refinando (1 a ${recent.length}) o 0 si es un diseño nuevo. Si refinás uno: (a) en changes_en escribí, en INGLÉS, la lista explícita y concreta de cambios a aplicar sobre ese flyer y nada más, con magnitudes claras (por ejemplo "Make the CAEIA logo about twice as large. Make the headline noticeably bigger."), porque ese flyer se le mostrará SOLO al modelo de imagen, con tu orden de edición, y debe ser inequívoca (si el pedido cambia algún texto del flyer, incluí el texto nuevo entre comillas, en español); (b) el visual_prompt describe el diseño COMPLETO ya con esos cambios aplicados. Si based_on es 0, changes_en va vacío.`
      : "0b. No hay flyers generados todavía: based_on va siempre en 0 y changes_en vacío.",
    images.length > 0
      ? "1. Analizá las capturas de inspiración nuevas (composición, jerarquía, estilo visual, paleta, tipografía, clima, recursos gráficos) y resumilo en analysis.summary. Son SOLO una referencia de estilo y composición: no copies sus textos, marcas, logos, personas ni elementos reconocibles; la pieza tiene que ser original y 100% de la marca."
      : style.length > 0
        ? "1. No hay capturas de inspiración nuevas: dejá analysis.adaptations y analysis.tags vacíos; analysis.summary lleva solo la lectura del estilo (ver 1b)."
        : "1. No hay capturas nuevas: dejá analysis.summary y analysis.adaptations vacíos y analysis.tags vacío.",
    style.length > 0
      ? `1b. ESTILO A RESPETAR: arriba ves ${style.length} ${style.length === 1 ? "flyer de estilo" : "flyers de estilo"} ("Flyer de estilo 1"${style.length > 1 ? " a " + style.length : ""}). Son flyers anteriores que el usuario eligió como modelo de su estilo de edición. A diferencia de las capturas de inspiración, acá SÍ hay que sostener su lenguaje visual con fidelidad: composición y estructura, tratamiento y jerarquía tipográfica, tipo de objetos o ilustraciones (por ejemplo renders 3D, vidrio, degradados), iluminación, paleta, efectos y nivel de detalle. Describí ese lenguaje en el visual_prompt de cada variación, aplicado a la idea y al texto nuevos, sin copiar el contenido ni los textos de esos flyers. Resumí el estilo que detectaste al comienzo de analysis.summary, con el prefijo "Estilo: ". Las reglas duras de la marca siguen mandando sobre cualquier referencia.`
      : "",
    "2. Si la referencia choca con las reglas duras o la paleta de la marca (por ejemplo usa neón, brillos, colores o símbolos prohibidos), mandan las reglas de la marca: tomá solo lo compatible y contá en analysis.adaptations qué ajustaste.",
    `3. Proponé exactamente ${count} ${count === 1 ? "variación" : "variaciones"} de la MISMA idea${count > 1 ? ", con enfoques visuales claramente distintos entre sí (otra composición, otro plano, otra metáfora o recurso visual). No quiero versiones casi iguales" : ""}.${images.length > 0 && count > 1 ? " Una de ellas tiene que ser la más fiel a la referencia, adaptada a la marca." : ""}`,
    "4. Cada variación lleva name, approach, headline, subheadline, cta, caption, visual_prompt y based_on. El titular y el texto pueden variar entre variaciones, pero todas respetan el ángulo, el estado del producto y las reglas duras. No inventes datos ni presión de venta que no figuren en la marca o en el estado del producto: nada de escasez o urgencia falsa (\"cupos limitados\", \"últimas plazas\", \"solo hoy\"), ni cifras, ni promesas.",
    "4b. TODO ES MARKETING. Cada flyer le habla a un cliente final (monotributista, responsable inscripto, comercio o PyME de Argentina) y vende beneficios: tiempo recuperado, simpleza, confianza. Ni en los textos ni en el visual_prompt puede haber nada técnico: ninguna palabra de programación o infraestructura (código, API, base de datos, servidor, nube, algoritmo, stack, nombres de tecnologías o proveedores) ni objetos visuales técnicos (código en pantalla, terminales, servidores, circuitos, diagramas, redes neuronales, matrices de datos). Usá escenas y objetos de la vida real del cliente: su comercio, sus facturas, su celular con WhatsApp, el reloj, el isotipo de la marca. Si la idea del usuario es técnica, traducila al beneficio para el cliente. Las capturas o mockups reales de las pantallas de la app sí valen: son producto, no tecnología.",
    "5. El visual_prompt DEBE estar escrito en INGLÉS (los modelos de imagen rinden mucho mejor así). Describí la imagen completa y decí dónde va cada texto. El título, la bajada y el CTA que van escritos en la imagen se citan entre comillas EN ESPAÑOL, tal cual, sin traducir.",
    "6. restrictions_en: traducí al INGLÉS las reglas duras de la marca como una lista breve de cosas a evitar y a respetar, para el modelo de imagen.",
    `7. assets_en: para cada asset de marca de la lista, escribí en INGLÉS una descripción corta que incluya su nota de uso traducida. Usá el nombre de archivo exacto.\n${
      assets.length > 0
        ? assets.map((a) => `- ${a.name} (${a.kind}): ${a.usage_note || "sin nota"}`).join("\n")
        : "(no hay assets: devolvé una lista vacía)"
    }`,
    "8. reply es tu mensaje al usuario en el chat (cercano, breve) y title el título del chat.",
    "Los campos reply, title, name, approach, headline, subheadline, cta, caption y analysis van en español; visual_prompt, restrictions_en y assets_en van en inglés.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const parts = [
    ...recent.flatMap((f, i) => [
      { text: `Flyer generado #${i + 1} (variación "${f.name}", titular "${f.headline}"):` },
      { inlineData: { mimeType: f.image.mimeType, data: Buffer.from(f.image.bytes).toString("base64") } },
    ]),
    ...style.flatMap((img, i) => [
      { text: `Flyer de estilo ${i + 1} (modelo cuyo estilo hay que respetar):` },
      { inlineData: { mimeType: img.mimeType, data: Buffer.from(img.bytes).toString("base64") } },
    ]),
    ...images.flatMap((img, i) => [
      { text: `Captura de inspiración nueva ${i + 1}:` },
      { inlineData: { mimeType: img.mimeType, data: Buffer.from(img.bytes).toString("base64") } },
    ]),
    { text: instructions },
  ];

  const res = await gemini().models.generateContent({
    model: TEXT_MODEL.id,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema,
      // El nivel por defecto (medium) tardaba unos 47 s con capturas; "low" acorta la espera.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const parsed = proposalSchema.parse(JSON.parse(res.text ?? ""));
  if (parsed.mode === "propose" && parsed.variations.length === 0) {
    throw new Error("El director no devolvió ninguna variación. Probá reformular el pedido.");
  }
  const inputTokens = res.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = res.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    mode: parsed.mode,
    reply: parsed.reply,
    title: parsed.title,
    analysis: parsed.analysis,
    assessment: parsed.assessment,
    concepts: parsed.variations.slice(0, count),
    restrictionsEn: parsed.restrictions_en,
    assetsEn: parsed.assets_en,
    inputTokens,
    outputTokens,
    costUsd: textCostUsd(inputTokens, outputTokens),
  };
}
