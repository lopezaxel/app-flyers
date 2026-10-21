"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { coverageNote, coverageText, getAngleStats } from "@/lib/angle-stats";
import { requireUser } from "@/lib/auth";
import { BudgetError } from "@/lib/budget";
import { buildHistory, lastInspirationIds, lastResultFlyerIds, lastStyle } from "@/lib/chat-history";
import type { ChatSettings } from "@/lib/chat-types";
import { addMessage, createChat, deleteChat, getChat, getMessage, getMessages, setChatTitle } from "@/lib/chats";
import { query } from "@/lib/db";
import { MAX_STYLE } from "./image-utils";
import {
  createVariations,
  flyersAreReady,
  proposeConcepts,
  regenerateFlyer,
  saveInspirations,
  tagInspirations,
  type InspirationImage,
} from "@/lib/flyers";
import { explainGeminiError } from "@/lib/gemini/client";
import { conceptSchema } from "@/lib/gemini/director";
import { ASPECT_RATIOS } from "@/lib/gemini/models";
import { MAX_UPLOAD_BYTES, sniffImage } from "@/lib/storage";

const MAX_ATTACHMENTS = 3;
const MAX_VARIATIONS = 4;

export type ActionResult = { error?: string; chatId?: string };

/** Lee y valida las imágenes adjuntas (tamaño y tipo real por los primeros bytes). */
async function readImages(files: File[]): Promise<{ images: InspirationImage[] } | { error: string }> {
  const images: InspirationImage[] = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) return { error: `${file.name} pesa más de 4 MB.` };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImage(bytes);
    if (!type) return { error: `${file.name} no es un PNG, JPEG o WebP válido.` };
    images.push({ name: file.name, bytes, type });
  }
  return { images };
}

function failure(e: unknown) {
  return e instanceof BudgetError ? e.message : explainGeminiError(e);
}

const sendSchema = z.object({
  chat_id: z.string().uuid().optional(),
  text: z.string().trim().min(2, "Escribí tu mensaje").max(4000),
  angle_id: z.string().uuid().optional(),
  format: z.enum(ASPECT_RATIOS),
  tier: z.enum(["draft", "final"]),
  size: z.enum(["1K", "2K", "4K"]),
  count: z.coerce.number().int().min(1).max(MAX_VARIATIONS),
});

/** Un turno del chat: guarda el mensaje del usuario y la respuesta del director con las variaciones. */
export async function sendMessageAction(formData: FormData): Promise<ActionResult> {
  await requireUser();
  const raw = Object.fromEntries(formData);
  const parsed = sendSchema.safeParse({ ...raw, chat_id: raw.chat_id || undefined, angle_id: raw.angle_id || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá el mensaje." };
  const { text, angle_id, format, tier, size, count } = parsed.data;

  const files = formData.getAll("inspiration").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_ATTACHMENTS) return { error: `Podés adjuntar hasta ${MAX_ATTACHMENTS} capturas por mensaje.` };
  const styleFiles = formData.getAll("style_upload").filter((f): f is File => f instanceof File && f.size > 0);
  const styleFlyers = z.array(z.string().uuid()).max(MAX_STYLE).safeParse(formData.getAll("style_flyer_id"));
  if (!styleFlyers.success) return { error: "Revisá los flyers de estilo elegidos." };
  if (styleFiles.length + styleFlyers.data.length > MAX_STYLE) {
    return { error: `Podés elegir hasta ${MAX_STYLE} flyers de estilo por mensaje.` };
  }
  if (!(await flyersAreReady(styleFlyers.data))) return { error: "Uno de los flyers de estilo ya no está disponible." };

  const inspiration = await readImages(files);
  if ("error" in inspiration) return { error: inspiration.error };
  const style = await readImages(styleFiles);
  if ("error" in style) return { error: style.error };
  const images = inspiration.images;

  let chatId = parsed.data.chat_id;
  if (chatId && !(await getChat(chatId))) return { error: "Ese chat ya no existe." };
  const isFirstTurn = !chatId;
  chatId ??= await createChat(text);

  try {
    const angleName = angle_id
      ? ((await query<{ name: string }>("select name from app_flyers.angles where id = $1", [angle_id])).rows[0]?.name ?? null)
      : null;
    const settings: ChatSettings = { angleId: angle_id ?? null, angleName, format, tier, size, count };

    const prior = await getMessages(chatId);
    const attachmentIds = await saveInspirations(images, text);
    const newStyleIds = await saveInspirations(style.images, text, "style");
    // Sin flyers de estilo nuevos se heredan los del chat, para que los ajustes sigan con el mismo modelo.
    const hasNewStyle = newStyleIds.length + styleFlyers.data.length > 0;
    const inherited = hasNewStyle ? null : lastStyle(prior);
    const styleIds = inherited ? inherited.ids : newStyleIds;
    const styleFlyerIds = inherited ? inherited.flyerIds : styleFlyers.data;
    await addMessage(chatId, "user", {
      type: "user",
      text,
      attachmentIds,
      styleIds: newStyleIds,
      styleFlyerIds: styleFlyers.data,
      settings,
    });

    try {
      const stats = await getAngleStats();
      const result = await proposeConcepts({
        coverage: coverageText(stats),
        angleId: angle_id ?? null,
        topic: text,
        format,
        count,
        images,
        styleInspirationIds: styleIds,
        styleFlyerIds,
        history: buildHistory(prior),
        recentFlyerIds: lastResultFlyerIds(prior),
      });
      if (isFirstTurn && result.title.trim()) await setChatTitle(chatId, result.title.trim());
      if (result.mode === "chat") {
        // Era una consulta: se responde en el chat, sin propuestas.
        await addMessage(chatId, "assistant", { type: "reply", text: result.reply });
      } else {
        await tagInspirations(attachmentIds, result.analysis.tags);
        // Con ángulo "libre", el flyer cuenta para el ángulo que el director recomendó.
        const effectiveAngleId = angle_id ?? result.recommendedAngleId ?? null;
        await addMessage(chatId, "assistant", {
          type: "proposal",
          reply: result.reply,
          analysis: result.analysis,
          concepts: result.concepts,
          restrictionsEn: result.restrictionsEn,
          assetsEn: result.assetsEn,
          // Sin capturas nuevas se heredan las del chat, para que los ajustes sigan con la misma referencia.
          inspirationIds: attachmentIds.length > 0 ? attachmentIds : lastInspirationIds(prior),
          styleIds,
          styleFlyerIds,
          angleId: effectiveAngleId,
          format,
          topic: text,
          coverage: effectiveAngleId ? coverageNote(effectiveAngleId, stats) : undefined,
          assessment: result.assessment.applies ? result.assessment : undefined,
          recommendedAngleId: result.recommendedAngleId !== effectiveAngleId ? result.recommendedAngleId : null,
        });
      }
    } catch (e) {
      await addMessage(chatId, "assistant", { type: "error", text: failure(e) });
    }
  } catch (e) {
    return { error: failure(e), chatId };
  }
  revalidatePath("/generar");
  revalidatePath("/");
  return { chatId };
}

const generateSchema = z.object({
  chat_id: z.string().uuid(),
  proposal_id: z.string().uuid(),
  tier: z.enum(["draft", "final"]),
  size: z.enum(["1K", "2K", "4K"]),
  restrictions_en: z.string().max(4000),
  concepts: z.string().transform((s, ctx) => {
    try {
      return z.array(conceptSchema).min(1, "Elegí al menos una variación").max(MAX_VARIATIONS).parse(JSON.parse(s));
    } catch {
      ctx.addIssue({ code: "custom", message: "Elegí al menos una variación y revisá que no queden campos vacíos." });
      return z.NEVER;
    }
  }),
});

/** Genera las imágenes de las variaciones elegidas (con las ediciones del usuario) y las suma al chat. */
export async function generateAction(formData: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = generateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá los campos." };
  const { chat_id, proposal_id, tier, size, restrictions_en, concepts } = parsed.data;

  // Formato, ángulo y capturas salen de la propuesta guardada, no de lo que mande el navegador.
  const proposal = await getMessage(chat_id, proposal_id);
  if (!proposal || proposal.content.type !== "proposal") return { error: "No encuentro esa propuesta." };
  const p = proposal.content;

  try {
    const result = await createVariations({
      angleId: p.angleId,
      topic: p.topic,
      format: p.format,
      tier,
      size,
      concepts,
      inspirationIds: p.inspirationIds,
      styleInspirationIds: p.styleIds ?? [],
      styleFlyerIds: p.styleFlyerIds ?? [],
      restrictionsEn: restrictions_en,
      assetsEn: p.assetsEn,
    });
    if (result.ok === 0) {
      await addMessage(chat_id, "assistant", { type: "error", text: result.errors[0] ?? "No se pudo generar ninguna variación." });
    } else {
      await addMessage(chat_id, "assistant", { type: "result", flyerIds: result.flyerIds, tier, size, errors: result.errors });
    }
  } catch (e) {
    await addMessage(chat_id, "assistant", { type: "error", text: failure(e) });
  }
  revalidatePath("/generar");
  revalidatePath("/flyers");
  revalidatePath("/");
  return { chatId: chat_id };
}

const regenerateSchema = z.object({
  chat_id: z.string().uuid(),
  flyer_id: z.string().uuid(),
  tier: z.enum(["draft", "final"]),
  size: z.enum(["1K", "2K", "4K"]),
});

/** Vuelve a generar un solo flyer (mismo prompt y referencias) y suma el nuevo al chat. */
export async function regenerateAction(formData: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = regenerateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "No se pudo regenerar ese flyer." };
  const { chat_id, flyer_id, tier, size } = parsed.data;
  if (!(await getChat(chat_id))) return { error: "Ese chat ya no existe." };

  try {
    const result = await regenerateFlyer({ flyerId: flyer_id, tier, size });
    if (result.error) {
      await addMessage(chat_id, "assistant", { type: "error", text: result.error });
    } else {
      await addMessage(chat_id, "assistant", { type: "result", flyerIds: [result.flyerId], tier, size, errors: [] });
    }
  } catch (e) {
    await addMessage(chat_id, "assistant", { type: "error", text: failure(e) });
  }
  revalidatePath("/generar");
  revalidatePath("/flyers");
  revalidatePath("/");
  return { chatId: chat_id };
}

export async function deleteChatAction(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("chat_id"));
  await deleteChat(id);
  revalidatePath("/generar");
  redirect("/generar");
}
