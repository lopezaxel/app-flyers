import type { ChatMessage } from "./chat-types";
import type { HistoryTurn } from "./gemini/director";

const MAX_TURNS = 8;

/** Resume los mensajes anteriores del chat a texto para que el director entienda los pedidos de ajuste. */
export function buildHistory(messages: ChatMessage[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const m of messages) {
    const c = m.content;
    if (c.type === "user") {
      const files = c.attachmentIds.length;
      turns.push({
        role: "user",
        text: `${c.text}${files > 0 ? ` [adjuntó ${files} ${files === 1 ? "captura" : "capturas"} de inspiración]` : ""}`,
      });
    } else if (c.type === "proposal") {
      const list = c.concepts
        .map(
          (x, i) =>
            `${i + 1}. ${x.name}: titular "${x.headline}", bajada "${x.subheadline}", CTA "${x.cta}". Prompt visual: ${x.visual_prompt.slice(0, 600)}`,
        )
        .join("\n");
      const verdict = c.assessment
        ? `\nEvaluación de la idea (${c.assessment.verdict}): ${c.assessment.reason} Recomendación: ${c.assessment.recommendation}`
        : "";
      turns.push({ role: "assistant", text: `${c.reply}${verdict}\nVariaciones propuestas:\n${list}` });
    } else if (c.type === "reply") {
      turns.push({ role: "assistant", text: c.text });
    } else if (c.type === "result") {
      turns.push({ role: "assistant", text: `Se generaron ${c.flyerIds.length} flyer(s) con las variaciones elegidas.` });
    }
  }
  return turns.slice(-MAX_TURNS);
}

/** Capturas más recientes del chat (de una propuesta o de un mensaje): se heredan si el nuevo mensaje no trae las suyas. */
export function lastInspirationIds(messages: ChatMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i].content;
    if (c.type === "proposal") return c.inspirationIds;
    if (c.type === "user" && c.attachmentIds.length > 0) return c.attachmentIds;
  }
  return [];
}

/** Ids de los flyers del último resultado del chat (los que el director puede mirar). */
export function lastResultFlyerIds(messages: ChatMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i].content;
    if (c.type === "result") return c.flyerIds;
  }
  return [];
}
