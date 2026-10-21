"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { deleteChatAction, generateAction, regenerateAction, sendMessageAction } from "./actions";
import { Composer, type ComposerSettings } from "./composer";
import { ErrorView, PendingBubble, ProposalView, ReplyView, ResultView, UserBubble } from "./message-views";
import { Popover, pillClass } from "./popover";
import { angleLabel } from "@/lib/angle-label";
import type { AngleOption, ChatFlyer, ChatMessage, ChatSummary } from "@/lib/chat-types";
import type { Concept } from "@/lib/gemini/director";
import { estimateImagesCostUsd } from "@/lib/gemini/models";

const SUGGESTIONS = [
  "Convocar al lanzamiento de CAEIA del miércoles 18 de noviembre en la Cámara de Comercio de Salta",
  "Un flyer sobre que nunca te pedimos tu clave fiscal",
  "ARCA se cae y perdés tiempo facturando: mostrá cómo CAEIA te lo ahorra",
];

const dateFmt = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" });

type Props = {
  chatId: string | null;
  title: string;
  messages: ChatMessage[];
  flyers: ChatFlyer[];
  chats: ChatSummary[];
  angles: AngleOption[];
  usage: { spentUsd: number; capUsd: number };
};

export function ChatClient({ chatId, title, messages, flyers, chats, angles, usage }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [settings, setSettings] = useState<ComposerSettings>({ angleId: "", format: "4:5", tier: "draft", size: "1K", count: 3 });
  const [error, setError] = useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [shown, addOptimistic] = useOptimistic(messages, (current: ChatMessage[], next: ChatMessage) => [...current, next]);
  const flyerMap = useMemo(() => Object.fromEntries(flyers.map((f) => [f.id, f])), [flyers]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const empty = shown.length === 0 && !pendingLabel;

  // Cada mensaje nuevo (o la espera de una respuesta) lleva el chat al final y lo mantiene unos segundos,
  // porque las imágenes terminan de cargar después y agrandan el contenido.
  useEffect(() => {
    stickRef.current = true;
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
    const release = setTimeout(() => (stickRef.current = false), 12000);
    return () => clearTimeout(release);
  }, [shown.length, pendingLabel]);

  useEffect(() => {
    const box = scrollRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const follow = () => {
      if (stickRef.current) box.scrollTop = box.scrollHeight;
    };
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    return () => observer.disconnect();
  }, [empty]);

  function send(files: File[], override?: { text: string; angleId: string }) {
    const message = (override?.text ?? text).trim();
    const angleId = override?.angleId ?? settings.angleId;
    const form = new FormData();
    if (chatId) form.set("chat_id", chatId);
    form.set("text", message);
    form.set("angle_id", angleId);
    form.set("format", settings.format);
    form.set("tier", settings.tier);
    form.set("size", settings.size);
    form.set("count", String(settings.count));
    files.forEach((f) => form.append("inspiration", f));

    const previewUrls = files.map((f) => URL.createObjectURL(f));
    const angleName = angles.find((a) => a.id === angleId)?.name ?? null;
    if (!override) setText("");
    setError(null);
    setPendingLabel("Analizando tu pedido…");
    startTransition(async () => {
      addOptimistic({
        id: `enviando-${Date.now()}`,
        role: "user",
        createdAt: new Date().toISOString(),
        content: {
          type: "user",
          text: message,
          attachmentIds: [],
          previewUrls,
          settings: { ...settings, angleId: angleId || null, angleName },
        },
      });
      try {
        const result = await sendMessageAction(form);
        if (result.error) {
          setError(result.error);
          if (!override) setText(message);
        }
        if (result.chatId && !chatId) router.replace(`/generar?chat=${result.chatId}`);
      } catch {
        setError("No se pudo enviar el mensaje. Probá de nuevo.");
        if (!override) setText(message);
      } finally {
        setPendingLabel(null);
        previewUrls.forEach((u) => URL.revokeObjectURL(u));
      }
    });
  }

  /** "Rehacer con el ángulo recomendado": cambia el botón de ángulo y reenvía el pedido con ese ángulo. */
  function redoWithAngle(angleId: string, angleName: string) {
    setSettings((s) => ({ ...s, angleId }));
    send([], { text: `Rehacé la propuesta con el ángulo «${angleLabel(angleName)}», como recomendaste.`, angleId });
  }

  function generate({ proposalId, concepts, restrictions }: { proposalId: string; concepts: Concept[]; restrictions: string }) {
    if (!chatId) return;
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("proposal_id", proposalId);
    form.set("tier", settings.tier);
    form.set("size", settings.size);
    form.set("restrictions_en", restrictions);
    form.set("concepts", JSON.stringify(concepts));
    setError(null);
    setPendingLabel(`Generando ${concepts.length} ${concepts.length === 1 ? "flyer" : "flyers"}… puede tardar un par de minutos`);
    startTransition(async () => {
      try {
        const result = await generateAction(form);
        if (result.error) setError(result.error);
      } catch {
        setError("No se pudo generar. Probá de nuevo.");
      } finally {
        setPendingLabel(null);
      }
    });
  }

  function regenerate(flyerId: string) {
    if (!chatId) return;
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("flyer_id", flyerId);
    form.set("tier", settings.tier);
    form.set("size", settings.size);
    setError(null);
    setPendingLabel("Regenerando el flyer…");
    startTransition(async () => {
      try {
        const result = await regenerateAction(form);
        if (result.error) setError(result.error);
      } catch {
        setError("No se pudo regenerar. Probá de nuevo.");
      } finally {
        setPendingLabel(null);
      }
    });
  }

  /** "Pedir cambios" deja el cuadro listo para escribir el ajuste sobre ese flyer. */
  function askChanges(flyerName: string) {
    setText(`Sobre «${flyerName}»: `);
    document.querySelector<HTMLTextAreaElement>("textarea[data-composer]")?.focus();
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          <p className="font-mono text-[11px] text-white/40">
            Este mes US$ {usage.spentUsd.toFixed(2)} de {usage.capUsd.toFixed(2)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Popover
            align="right"
            placement="bottom"
            triggerClassName={pillClass}
            trigger={
              <>
                <span>Historial</span>
                <span className="text-white/40">▾</span>
              </>
            }
          >
            {(close) =>
              chats.length === 0 ? (
                <p className="px-3 py-2 text-sm text-white/50">Todavía no hay chats.</p>
              ) : (
                <ul className="w-72">
                  {chats.map((c) => (
                    <li key={c.id} className={`flex items-center gap-1 rounded-lg ${c.id === chatId ? "bg-white/[0.07]" : "hover:bg-white/10"}`}>
                      <Link href={`/generar?chat=${c.id}`} onClick={close} className="min-w-0 flex-1 px-3 py-2 text-sm">
                        <span className="block truncate text-white/90">{c.title}</span>
                        <span className="block text-xs text-white/40">{dateFmt.format(new Date(c.updatedAt))}</span>
                      </Link>
                      <form
                        action={deleteChatAction}
                        onSubmit={(e) => {
                          if (!window.confirm("¿Borrar este chat? Los flyers generados se conservan en Flyers.")) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="chat_id" value={c.id} />
                        <button aria-label={`Borrar ${c.title}`} className="rounded-md px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white">
                          ✕
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )
            }
          </Popover>
          <Link href="/generar" className="btn-ghost">
            + Nuevo chat
          </Link>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          // Si la persona sube a leer o editar, el chat deja de seguir el final.
          const box = e.currentTarget;
          if (box.scrollHeight - box.scrollTop - box.clientHeight > 160) stickRef.current = false;
        }}
        className="min-h-0 flex-1 overflow-y-auto pr-1"
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
            <div>
              <h2 className="text-2xl font-semibold">¿Qué flyer armamos hoy?</h2>
              <p className="mt-2 text-sm text-white/55">
                Contame la idea, pegá capturas de inspiración con Ctrl+V y elegí abajo el formato y el modelo.
              </p>
            </div>
            <ul className="flex max-w-2xl flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => setText(s)} className="btn-ghost w-full !rounded-xl !px-4 !py-2.5 text-left">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
            {angles.some((a) => a.enabled) && (
              <div className="w-full max-w-2xl">
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/40">
                  Tu cobertura de ángulos · tocá uno para elegirlo
                </p>
                <ul className="flex flex-wrap justify-center gap-2">
                  {angles
                    .filter((a) => a.enabled)
                    .map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSettings((s) => ({ ...s, angleId: a.id }))}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:bg-white/10 ${
                            settings.angleId === a.id ? "border-white/50 bg-white/10" : a.total === 0 ? "border-dashed border-white/25" : "border-white/15"
                          }`}
                        >
                          <span className="text-white/85">{angleLabel(a.name)}</span>
                          <span className="font-mono text-white/55">{a.total === 0 ? "sin flyers" : a.total}</span>
                          {a.today > 0 && <span className="font-mono text-white/40">· {a.today} hoy</span>}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div ref={contentRef} className="flex flex-col gap-6 pb-2">
            {shown.map((m) => {
              const c = m.content;
              switch (c.type) {
                case "user":
                  return <UserBubble key={m.id} content={c} />;
                case "proposal":
                  return (
                    <ProposalView
                      key={m.id}
                      messageId={m.id}
                      content={c}
                      tier={settings.tier}
                      size={settings.size}
                      busy={busy}
                      recommendedAngle={angles.find((a) => a.id === c.recommendedAngleId) ?? null}
                      onGenerate={generate}
                      onUseAngle={redoWithAngle}
                    />
                  );
                case "result":
                  return (
                    <ResultView
                      key={m.id}
                      content={c}
                      flyers={flyerMap}
                      busy={busy}
                      regenerateCost={estimateImagesCostUsd(settings.tier, settings.size, 1)}
                      onRegenerate={regenerate}
                      onAskChanges={askChanges}
                    />
                  );
                case "reply":
                  return <ReplyView key={m.id} text={c.text} />;
                case "error":
                  return <ErrorView key={m.id} text={c.text} />;
              }
            })}
            {pendingLabel && <PendingBubble label={pendingLabel} />}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm text-white/90">
          {error}
        </p>
      )}

      <Composer
        text={text}
        onText={setText}
        settings={settings}
        onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
        angles={angles}
        busy={busy}
        onSend={send}
      />
    </div>
  );
}
