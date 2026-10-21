// Tipos del chat compartidos entre servidor y cliente (sin imports de servidor).
import type { Analysis, Assessment, AssetNote, Concept } from "./gemini/director";
import type { AspectRatio, ImageSize, ImageTier } from "./gemini/models";

/** Un ángulo con su cuenta de flyers ya generados (para el menú y el tablero de cobertura). */
export type AngleOption = {
  id: string;
  name: string;
  total: number;
  today: number;
  /** false para los ángulos marcados [ESPERAR] o [más adelante]: no cuentan como faltantes. */
  enabled: boolean;
};

/** Cobertura del ángulo elegido al momento de la propuesta (se guarda tal cual, no se recalcula). */
export type CoverageNote = {
  angleName: string;
  total: number;
  today: number;
  yesterday: number;
  lastAt: string | null;
  /** Ángulos habilitados que todavía no tienen ningún flyer. */
  untouched: string[];
};

/** Lo que el usuario tenía elegido en los botones del chat al enviar. */
export type ChatSettings = {
  angleId: string | null;
  angleName: string | null;
  format: AspectRatio;
  tier: ImageTier;
  size: ImageSize;
  count: number;
};

export type UserContent = {
  type: "user";
  text: string;
  /** Capturas de inspiración adjuntas (ids de la tabla inspiration). */
  attachmentIds: string[];
  settings: ChatSettings;
  /** Solo en el cliente: miniaturas locales mientras el mensaje todavía se está enviando. */
  previewUrls?: string[];
};

export type ProposalContent = {
  type: "proposal";
  reply: string;
  analysis: Analysis;
  concepts: Concept[];
  restrictionsEn: string;
  assetsEn: AssetNote[];
  /** Capturas que se usan como referencia de estilo al generar (las nuevas o las heredadas del chat). */
  inspirationIds: string[];
  angleId: string | null;
  format: AspectRatio;
  topic: string;
  /** Cuántos flyers llevaba ese ángulo cuando se hizo la propuesta. Solo si se eligió un ángulo. */
  coverage?: CoverageNote;
  /** Evaluación estratégica de la idea contra el producto. Solo cuando había una idea o captura nuevas. */
  assessment?: Assessment;
  /** Ángulo que recomienda el director, si es distinto del elegido. */
  recommendedAngleId?: string | null;
};

export type ResultContent = {
  type: "result";
  flyerIds: string[];
  tier: ImageTier;
  size: ImageSize;
  /** Motivos de las variaciones que fallaron, si hubo. */
  errors: string[];
};

export type ErrorContent = { type: "error"; text: string };

/** Respuesta de conversación: el director contestó una consulta sin proponer flyers. */
export type ReplyContent = { type: "reply"; text: string };

export type ChatContent = UserContent | ProposalContent | ResultContent | ErrorContent | ReplyContent;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  createdAt: string;
  content: ChatContent;
};

export type ChatSummary = { id: string; title: string; updatedAt: string };

/** Flyer tal como se muestra dentro del chat. */
export type ChatFlyer = {
  id: string;
  status: "pending" | "done" | "failed";
  headline: string;
  name: string;
  format: AspectRatio;
  costUsd: number;
};
