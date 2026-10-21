import { z } from "zod";
import { ChatClient } from "./chat-client";
import { getAngleStats, toOptions } from "@/lib/angle-stats";
import { getChat, getChatFlyers, getMessages, listChats } from "@/lib/chats";
import { getMonthUsage } from "@/lib/usage";

// Generar imágenes puede superar el timeout por defecto de las funciones.
export const maxDuration = 120;

export default async function GenerarPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { chat } = await searchParams;
  const requestedId = z.string().uuid().safeParse(chat);

  const [stats, chats, usage, current] = await Promise.all([
    getAngleStats(),
    listChats(),
    getMonthUsage(),
    requestedId.success ? getChat(requestedId.data) : Promise.resolve(null),
  ]);
  const messages = current ? await getMessages(current.id) : [];
  const flyers = await getChatFlyers(messages.flatMap((m) => (m.content.type === "result" ? m.content.flyerIds : [])));

  return (
    // Sin "key": al crearse el chat el componente no se reinicia y los botones conservan lo elegido.
    <ChatClient
      chatId={current?.id ?? null}
      title={current?.title ?? "Nuevo chat"}
      messages={messages}
      flyers={flyers}
      chats={chats}
      angles={toOptions(stats)}
      usage={{ spentUsd: usage.spentUsd, capUsd: usage.capUsd }}
    />
  );
}
