import { query } from "./db";
import type { ChatContent, ChatFlyer, ChatMessage, ChatSummary, LibraryFlyer } from "./chat-types";
import type { AspectRatio } from "./gemini/models";

type MessageRow = { id: string; role: "user" | "assistant"; content: ChatContent; created_at: Date };

export async function listChats(): Promise<ChatSummary[]> {
  const { rows } = await query<{ id: string; title: string; updated_at: Date }>(
    "select id, title, updated_at from app_flyers.chats order by updated_at desc limit 50",
  );
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at.toISOString() }));
}

export async function getChat(id: string) {
  const { rows } = await query<{ id: string; title: string }>("select id, title from app_flyers.chats where id = $1", [id]);
  return rows[0] ?? null;
}

export async function createChat(title: string) {
  const { rows } = await query<{ id: string }>("insert into app_flyers.chats (title) values ($1) returning id", [
    title.slice(0, 80) || "Nuevo chat",
  ]);
  return rows[0].id;
}

export async function setChatTitle(id: string, title: string) {
  await query("update app_flyers.chats set title = $2 where id = $1", [id, title.slice(0, 80)]);
}

export async function deleteChat(id: string) {
  await query("delete from app_flyers.chats where id = $1", [id]);
}

export async function addMessage(chatId: string, role: "user" | "assistant", content: ChatContent) {
  const { rows } = await query<{ id: string }>(
    "insert into app_flyers.chat_messages (chat_id, role, content) values ($1, $2, $3::jsonb) returning id",
    [chatId, role, JSON.stringify(content)],
  );
  await query("update app_flyers.chats set updated_at = now() where id = $1", [chatId]);
  return rows[0].id;
}

export async function getMessages(chatId: string): Promise<ChatMessage[]> {
  const { rows } = await query<MessageRow>(
    "select id, role, content, created_at from app_flyers.chat_messages where chat_id = $1 order by created_at, id",
    [chatId],
  );
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.created_at.toISOString() }));
}

export async function getMessage(chatId: string, messageId: string): Promise<ChatMessage | null> {
  const { rows } = await query<MessageRow>(
    "select id, role, content, created_at from app_flyers.chat_messages where id = $1 and chat_id = $2",
    [messageId, chatId],
  );
  const r = rows[0];
  return r ? { id: r.id, role: r.role, content: r.content, createdAt: r.created_at.toISOString() } : null;
}

/** Los últimos flyers terminados, para elegirlos como modelo de estilo. */
export async function listLibraryFlyers(): Promise<LibraryFlyer[]> {
  const { rows } = await query<{ id: string; copy: { headline?: string; name?: string }; format: AspectRatio }>(
    `select id, copy, format from app_flyers.flyers
     where status = 'done' and image_url is not null
     order by created_at desc limit 24`,
  );
  return rows.map((r) => ({ id: r.id, label: r.copy.headline || r.copy.name || "Flyer", format: r.format }));
}

/** Datos de los flyers que aparecen en los resultados del chat. */
export async function getChatFlyers(ids: string[]): Promise<ChatFlyer[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<{
    id: string;
    status: ChatFlyer["status"];
    copy: { headline?: string; name?: string };
    format: AspectRatio;
    cost_usd: string;
  }>("select id, status, copy, format, cost_usd from app_flyers.flyers where id = any($1::uuid[])", [ids]);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    headline: r.copy.headline ?? "",
    name: r.copy.name ?? "",
    format: r.format,
    costUsd: Number(r.cost_usd),
  }));
}
