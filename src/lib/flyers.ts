import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { assertWithinBudget, logUsage } from "./budget";
import { getBrand, type Brand } from "./brand";
import { query } from "./db";
import { proposeVariations, type Analysis, type AssetNote, type Concept, type HistoryTurn, type RecentFlyer } from "./gemini/director";
import { generateImage, type RefImage } from "./gemini/image";
import {
  IMAGE_MODELS,
  TEXT_MODEL,
  estimateImagesCostUsd,
  type AspectRatio,
  type ImageSize,
  type ImageTier,
} from "./gemini/models";
import { explainGeminiError } from "./gemini/client";
import { readImageBytes, saveImage, sniffImage, type ImageType } from "./storage";
import { looksLikeSvg, svgToPng } from "./svg";

// Tope de logos y capturas de la app por flyer: cada imagen suma tokens de entrada.
const MAX_REFS = 6;
// Margen para la llamada al director creativo al estimar el costo antes de gastar.
const TEXT_CALL_ESTIMATE_USD = 0.03;
// Cuántos flyers del último resultado puede mirar el director, y a qué tamaño (más grande = más tokens).
const MAX_RECENT_FLYERS = 4;
const DIRECTOR_VIEW_SIDE = 1024;
const BASE_VIEW_SIDE = 1536;

type Asset = { kind: string; name: string; url: string; usage_note: string };

const kindLabel: Record<string, string> = { logo: "Logo", app_screenshot: "App screenshot", other: "Reference" };

async function loadAssetRefs(assets: Asset[]): Promise<RefImage[]> {
  return Promise.all(
    assets.map(async (a) => {
      const bytes = await readImageBytes(a.url);
      if (!bytes) throw new Error(`No se pudo leer el asset "${a.name}": ya no está en el almacenamiento.`);
      const type = sniffImage(bytes);
      if (type) return { mimeType: type.mime, bytes };
      // Gemini no acepta SVG: se convierte a PNG.
      if (looksLikeSvg(bytes)) {
        return { mimeType: "image/png", bytes: new Uint8Array(await svgToPng(bytes)) };
      }
      throw new Error(`El asset "${a.name}" no es una imagen válida.`);
    }),
  );
}

async function loadAssets() {
  const { rows } = await query<Asset>(
    `select kind, name, url, usage_note from app_flyers.assets
     order by case kind when 'logo' then 0 when 'app_screenshot' then 1 else 2 end, created_at
     limit ${MAX_REFS}`,
  );
  return rows;
}

async function loadInspirationRefs(ids: string[]): Promise<RefImage[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<{ url: string }>(
    "select url from app_flyers.inspiration where id = any($1::uuid[]) order by created_at",
    [ids],
  );
  return Promise.all(
    rows.map(async (r) => {
      const bytes = await readImageBytes(r.url);
      const type = bytes && sniffImage(bytes);
      if (!bytes || !type) throw new Error("No se pudo leer una de las capturas de inspiración.");
      return { mimeType: type.mime, bytes };
    }),
  );
}

/** Imagen de un flyer ya generado, achicada para usarla de referencia. Null si todavía no existe. */
async function flyerImageRef(imageUrl: string, maxSide: number): Promise<RefImage | null> {
  const bytes = await readImageBytes(imageUrl);
  if (!bytes) return null;
  const jpeg = await sharp(Buffer.from(bytes))
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { mimeType: "image/jpeg", bytes: new Uint8Array(jpeg) };
}

/** Flyers del último resultado del chat, con su imagen, para que el director los mire. */
async function loadRecentFlyers(flyerIds: string[]): Promise<(RecentFlyer & { id: string })[]> {
  if (flyerIds.length === 0) return [];
  const { rows } = await query<{ id: string; image_url: string; copy: { name?: string; headline?: string } }>(
    `select id, image_url, copy from app_flyers.flyers
     where id = any($1::uuid[]) and status = 'done' and image_url is not null
     order by created_at limit ${MAX_RECENT_FLYERS}`,
    [flyerIds],
  );
  const loaded = await Promise.all(
    rows.map(async (r) => {
      const image = await flyerImageRef(r.image_url, DIRECTOR_VIEW_SIDE);
      return image ? { id: r.id, name: r.copy.name ?? "", headline: r.copy.headline ?? "", image } : null;
    }),
  );
  return loaded.filter((f): f is NonNullable<typeof f> => f !== null);
}

/** El prompt de imagen va entero en inglés; solo el texto que se escribe dentro de la imagen queda en español. */
function buildImagePrompt(
  concept: Concept,
  brand: Brand,
  assets: Asset[],
  inspirationCount: number,
  hasBase: boolean,
  context: { restrictionsEn: string; assetsEn: AssetNote[] },
) {
  const text = [
    `Headline: "${concept.headline}"`,
    concept.subheadline && `Subheadline: "${concept.subheadline}"`,
    concept.cta && `Call to action: "${concept.cta}"`,
  ].filter(Boolean);

  const attached = [
    ...assets.map((a, i) => {
      const description = context.assetsEn.find((n) => n.name === a.name)?.description;
      return `${i + 1}. ${kindLabel[a.kind] ?? a.kind}: ${a.name}${description ? ` — ${description}` : ""}`;
    }),
    ...Array.from({ length: inspirationCount }, (_, i) => `${assets.length + i + 1}. Style inspiration ${i + 1}`),
    ...(hasBase ? [`${assets.length + inspirationCount + 1}. Previous version of this flyer (base design)`] : []),
  ];

  // Si refina un flyer anterior, el prompt abre con una orden de edición explícita: los modelos de imagen
  // aplican mucho mejor "cambiá esto" que una descripción completa de la que tienen que deducir las diferencias.
  const changes = concept.changes_en?.trim();
  const lead =
    hasBase && changes
      ? [
          `Edit the last attached image, which is the previous version of this flyer. Apply exactly these changes and keep everything else identical (layout, copy, colors, logo placement, style):\n${changes}`,
          `For reference, this is the complete intended design after the changes:\n${concept.visual_prompt}`,
        ]
      : [concept.visual_prompt];

  return [
    ...lead,
    `Text to render in the image, written exactly as quoted (keep the Spanish wording, do not translate it, and do not add any other text):\n${text.join("\n")}`,
    attached.length > 0 && `Attached reference images, in order:\n${attached.join("\n")}`,
    assets.length > 0 &&
      "Use the logos exactly as provided, without redrawing or distorting them. The logos have transparent backgrounds (they may look black in the reference): place them over the design's own background, never copy any background rectangle, and choose the logo version that contrasts best with that background.",
    inspirationCount > 0 &&
      "The style-inspiration images are only a reference for composition and mood: do not copy their text, logos, people or recognizable elements. The result must be an original brand piece that respects the mandatory restrictions below, even if the inspiration breaks them.",
    hasBase &&
      "The last attached image is the previous version of this flyer. Keep its overall layout, composition and visual style, and apply ONLY the changes described above. Fix the problems the description addresses; do not carry over its mistakes.",
    // Cláusula fija: no depende de lo que haya escrito el director ni de lo que quede en las restricciones.
    "This is a marketing flyer for end customers: small business owners and freelancers in Argentina. Keep it strictly non-technical: no code, no software-development imagery, no servers, databases, circuits, terminals, diagrams or technology jargon, neither in the text nor in the visuals. Show real-life elements instead (a shop, invoices, a phone with WhatsApp, time, the brand's document icon).",
    brand.palette.length > 0 && `Brand palette (exact hex values): ${brand.palette.map((c) => c.hex).join(", ")}.`,
    context.restrictionsEn.trim() && `Mandatory restrictions:\n${context.restrictionsEn.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type InspirationImage = { name: string; bytes: Uint8Array; type: ImageType };

/** Guarda las capturas adjuntas en el Blob privado y en la tabla de inspiración. Devuelve sus ids. */
export async function saveInspirations(images: InspirationImage[], title: string) {
  const ids: string[] = [];
  for (const img of images) {
    const url = await saveImage("inspiration", img.name, img.bytes, img.type);
    const { rows } = await query<{ id: string }>(
      "insert into app_flyers.inspiration (url, title) values ($1, $2) returning id",
      [url, title.slice(0, 120)],
    );
    ids.push(rows[0].id);
  }
  return ids;
}

export async function tagInspirations(ids: string[], tags: string[]) {
  if (ids.length === 0 || tags.length === 0) return;
  await query("update app_flyers.inspiration set tags = $2 where id = any($1::uuid[])", [ids, tags]);
}

/**
 * Turno del chat: el director mira las capturas nuevas y los flyers ya generados, y según el mensaje responde
 * una consulta (mode "chat") o propone variaciones (mode "propose"). No genera imágenes.
 */
export async function proposeConcepts(input: {
  angleId: string | null;
  topic: string;
  format: AspectRatio;
  count: number;
  images: InspirationImage[];
  history: HistoryTurn[];
  /** Flyers del último resultado del chat, que el director puede mirar y refinar. */
  recentFlyerIds: string[];
  /** Cobertura de ángulos ya armada como texto (ver angle-stats). */
  coverage: string;
}) {
  await assertWithinBudget(TEXT_CALL_ESTIMATE_USD);
  const [brand, angleRes, assets, recent, allAngles] = await Promise.all([
    getBrand(),
    input.angleId
      ? query<{ name: string; instructions_md: string }>(
          "select name, instructions_md from app_flyers.angles where id = $1",
          [input.angleId],
        )
      : Promise.resolve({ rows: [] as { name: string; instructions_md: string }[] }),
    loadAssets(),
    loadRecentFlyers(input.recentFlyerIds),
    query<{ id: string; name: string; instructions_md: string }>(
      "select id, name, instructions_md from app_flyers.angles order by sort, created_at",
    ),
  ]);
  const angle = angleRes.rows[0] ?? null;
  if (input.angleId && !angle) throw new Error("El ángulo elegido ya no existe.");

  // Catálogo para que el director pueda recomendar un ángulo: solo los habilitados, con una pista de su objetivo.
  const enabledAngles = allAngles.rows.filter((a) => !/\[(ESPERAR|más adelante)\]/i.test(a.name));
  const angleCatalog = enabledAngles
    .map((a) => `- ${a.name}: ${a.instructions_md.replace(/\s+/g, " ").trim().slice(0, 240)}`)
    .join("\n");

  const refs: RefImage[] = input.images.map((i) => ({ mimeType: i.type.mime, bytes: i.bytes }));
  const director = await proposeVariations({
    brand,
    angle,
    topic: input.topic,
    format: input.format,
    images: refs,
    count: input.count,
    assets,
    history: input.history,
    recent,
    coverage: input.coverage,
    angleCatalog,
  });
  await logUsage({
    kind: "prompt",
    model: TEXT_MODEL.id,
    inputTokens: director.inputTokens,
    outputTokens: director.outputTokens,
    costUsd: director.costUsd,
  });

  // based_on (1..n) es el número con el que el director vio cada flyer: se traduce al id real.
  const concepts: Concept[] = director.concepts.map(({ based_on, ...c }) => ({
    ...c,
    base_flyer_id: based_on > 0 ? (recent[based_on - 1]?.id ?? null) : null,
  }));
  // El ángulo que recomienda el director, traducido a su id (solo si coincide con uno habilitado del catálogo).
  const wanted = director.assessment.recommended_angle.trim().toLowerCase();
  const recommendedAngleId = wanted ? (enabledAngles.find((a) => a.name.toLowerCase() === wanted)?.id ?? null) : null;

  return {
    mode: director.mode,
    reply: director.reply,
    title: director.title,
    analysis: director.analysis as Analysis,
    assessment: director.assessment,
    recommendedAngleId,
    concepts,
    restrictionsEn: director.restrictionsEn,
    assetsEn: director.assetsEn,
  };
}

type RenderParams = { tier: ImageTier; size: ImageSize; format: AspectRatio; prompt: string; refs: RefImage[] };

async function insertFlyer(p: {
  seriesId: string;
  angleId: string | null;
  topic: string;
  concept: Concept;
  format: AspectRatio;
  model: string;
  size: ImageSize;
  prompt: string;
  inspirationIds: string[];
}) {
  const { rows } = await query<{ id: string }>(
    `insert into app_flyers.flyers
       (series_id, angle_id, topic, copy, format, model, resolution, prompt, ref_inspiration_ids, status)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::uuid[], 'pending') returning id`,
    [p.seriesId, p.angleId, p.topic, JSON.stringify(p.concept), p.format, p.model, p.size, p.prompt, p.inspirationIds],
  );
  return rows[0].id;
}

/** Genera la imagen de un flyer ya insertado, registra el gasto y la guarda. Si algo falla, queda como "failed". */
async function renderInto(flyerId: string, p: RenderParams) {
  const model = IMAGE_MODELS[p.tier].id;
  try {
    const image = await generateImage({ tier: p.tier, prompt: p.prompt, aspectRatio: p.format, size: p.size, refs: p.refs });
    // Se registra el gasto antes de guardar: la imagen ya se cobró aunque falle el Blob.
    await logUsage({
      flyerId,
      kind: "image",
      model,
      inputTokens: image.inputTokens,
      outputTokens: image.outputTokens,
      imageCount: 1,
      costUsd: image.costUsd,
    });
    const type = sniffImage(image.bytes);
    if (!type) throw new Error("El modelo devolvió un formato de imagen no soportado.");
    const url = await saveImage("flyers", flyerId, image.bytes, type);
    await query("update app_flyers.flyers set status = 'done', image_url = $1, cost_usd = $2 where id = $3", [
      url,
      image.costUsd,
      flyerId,
    ]);
  } catch (e) {
    await query("update app_flyers.flyers set status = 'failed' where id = $1", [flyerId]);
    throw e;
  }
}

type BaseFlyer = { ref: RefImage; copy: Concept };

/** El flyer que una variación refina: su imagen (para el modelo de imagen) y su texto original. */
async function loadBase(flyerId: string | null | undefined): Promise<BaseFlyer | null> {
  if (!flyerId) return null;
  const { rows } = await query<{ image_url: string | null; copy: Concept }>(
    "select image_url, copy from app_flyers.flyers where id = $1 and status = 'done'",
    [flyerId],
  );
  const row = rows[0];
  if (!row?.image_url) return null;
  const ref = await flyerImageRef(row.image_url, BASE_VIEW_SIDE);
  return ref ? { ref, copy: row.copy } : null;
}

/**
 * Edición pura: el modelo recibe SOLO el flyer base y la orden de cambios. Mezclar la base con logos y capturas
 * hace que el modelo copie la base sin aplicar los cambios; con una sola imagen edita bien.
 */
function buildEditPrompt(concept: Concept, baseCopy: Concept) {
  const textChanges = [
    concept.headline !== baseCopy.headline && `Headline: "${concept.headline}"`,
    concept.subheadline !== baseCopy.subheadline && `Subheadline: "${concept.subheadline}"`,
    concept.cta !== baseCopy.cta && `Call to action: "${concept.cta}"`,
  ].filter(Boolean);
  return [
    `Edit this image. ${concept.changes_en?.trim()}`,
    textChanges.length > 0 &&
      `Update the text in the image so it reads exactly as follows (keep the Spanish wording, do not translate it):\n${textChanges.join("\n")}`,
    "Keep everything else identical: same background, same artwork, same remaining text, same colors, same positions. Do not add any new text.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type CreateVariationsInput = {
  angleId: string | null;
  topic: string;
  format: AspectRatio;
  tier: ImageTier;
  size: ImageSize;
  concepts: Concept[];
  inspirationIds: string[];
  restrictionsEn: string;
  assetsEn: AssetNote[];
};

/**
 * Genera una imagen por variación, en paralelo, y las guarda juntas como una serie. Si una variación refina un
 * flyer anterior, ese flyer viaja como base. Devuelve los ids de los flyers creados, cuántos salieron bien y por
 * qué fallaron los demás.
 */
export async function createVariations(input: CreateVariationsInput) {
  const { angleId, topic, format, tier, size, concepts, inspirationIds, restrictionsEn, assetsEn } = input;
  await assertWithinBudget(estimateImagesCostUsd(tier, size, concepts.length));

  const [brand, assets, inspirationRefs] = await Promise.all([getBrand(), loadAssets(), loadInspirationRefs(inspirationIds)]);
  const sharedRefs = [...(await loadAssetRefs(assets)), ...inspirationRefs];
  const baseIds = [...new Set(concepts.map((c) => c.base_flyer_id).filter((id): id is string => Boolean(id)))];
  const bases = new Map(await Promise.all(baseIds.map(async (id) => [id, await loadBase(id)] as const)));
  const model = IMAGE_MODELS[tier].id;
  const seriesId = randomUUID();

  const flyerIds: string[] = [];
  const renderOne = async (concept: Concept) => {
    const base = concept.base_flyer_id ? bases.get(concept.base_flyer_id) : null;
    // Con base y lista de cambios es una edición pura; sin cambios explícitos, la base va como una referencia más.
    const isEdit = Boolean(base && concept.changes_en?.trim());
    const prompt =
      isEdit && base
        ? buildEditPrompt(concept, base.copy)
        : buildImagePrompt(concept, brand, assets, inspirationRefs.length, Boolean(base), { restrictionsEn, assetsEn });
    const refs = isEdit && base ? [base.ref] : base ? [...sharedRefs, base.ref] : sharedRefs;
    const flyerId = await insertFlyer({ seriesId, angleId, topic, concept, format, model, size, prompt, inspirationIds });
    flyerIds.push(flyerId);
    await renderInto(flyerId, { tier, size, format, prompt, refs });
  };

  const results = await Promise.allSettled(concepts.map(renderOne));
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => explainGeminiError(r.reason));
  return { seriesId, flyerIds, ok: results.length - errors.length, errors };
}

/**
 * Vuelve a generar un flyer con el mismo prompt y las mismas referencias, y devuelve el nuevo.
 * Sirve para probar otra "tirada" del modelo sin tocar las demás variaciones.
 */
export async function regenerateFlyer(input: { flyerId: string; tier: ImageTier; size: ImageSize }) {
  const { flyerId, tier, size } = input;
  const { rows } = await query<{
    copy: Concept;
    prompt: string;
    format: AspectRatio;
    angle_id: string | null;
    topic: string;
    ref_inspiration_ids: string[];
  }>("select copy, prompt, format, angle_id, topic, ref_inspiration_ids from app_flyers.flyers where id = $1", [flyerId]);
  const original = rows[0];
  if (!original) throw new Error("No encuentro el flyer que querés regenerar.");

  await assertWithinBudget(estimateImagesCostUsd(tier, size, 1));
  const assets = await loadAssets();
  const [assetRefs, inspirationRefs, base] = await Promise.all([
    loadAssetRefs(assets),
    loadInspirationRefs(original.ref_inspiration_ids),
    loadBase(original.copy.base_flyer_id),
  ]);
  // Un flyer que nació de una edición se vuelve a editar desde su misma base, igual que la primera vez.
  const wasEdit = Boolean(base && original.copy.changes_en?.trim());
  const refs = wasEdit && base ? [base.ref] : [...assetRefs, ...inspirationRefs, ...(base ? [base.ref] : [])];

  const newId = await insertFlyer({
    seriesId: randomUUID(),
    angleId: original.angle_id,
    topic: original.topic,
    concept: original.copy,
    format: original.format,
    model: IMAGE_MODELS[tier].id,
    size,
    prompt: original.prompt,
    inspirationIds: original.ref_inspiration_ids,
  });
  try {
    await renderInto(newId, { tier, size, format: original.format, prompt: original.prompt, refs });
  } catch (e) {
    return { flyerId: newId, error: explainGeminiError(e) };
  }
  return { flyerId: newId, error: null };
}
