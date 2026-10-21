"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ACCEPTED_IMAGE_TYPES, MAX_ATTACHMENTS, shrinkImage } from "./image-utils";
import type { AngleOption } from "@/lib/chat-types";
import { OptionList, Popover, pillClass } from "./popover";
import {
  ASPECT_RATIOS,
  FORMAT_INFO,
  IMAGE_MODELS,
  type AspectRatio,
  type ImageSize,
  type ImageTier,
} from "@/lib/gemini/models";

export type ComposerSettings = {
  angleId: string;
  format: AspectRatio;
  tier: ImageTier;
  size: ImageSize;
  count: number;
};

type Attachment = { id: string; file: File; previewUrl: string };

type Props = {
  text: string;
  onText: (value: string) => void;
  settings: ComposerSettings;
  onSettings: (patch: Partial<ComposerSettings>) => void;
  angles: AngleOption[];
  busy: boolean;
  onSend: (files: File[]) => void;
};

function AspectIcon({ ratio }: { ratio: AspectRatio }) {
  const [w, h] = ratio.split(":").map(Number);
  const k = 14 / Math.max(w, h);
  return (
    <span
      aria-hidden
      className="inline-block rounded-[3px] border border-current opacity-80"
      style={{ width: Math.round(w * k), height: Math.round(h * k) }}
    />
  );
}

const tierShort = (t: ImageTier) => IMAGE_MODELS[t].label.split(" · ")[0];
const imageCost = (tier: ImageTier, size: ImageSize) => IMAGE_MODELS[tier].perImage[size].toFixed(2);

export function Composer({ text, onText, settings, onSettings, angles, busy, onSend }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const itemsRef = useRef<Attachment[]>([]);
  const [items, setItems] = useState<Attachment[]>([]);
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);

  function setAttachments(next: Attachment[]) {
    itemsRef.current = next;
    setItems(next);
  }

  async function addFiles(incoming: File[]) {
    const images = incoming.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
    if (images.length === 0) {
      if (incoming.length > 0) setNote("Solo se aceptan imágenes PNG, JPEG o WebP.");
      return;
    }
    const room = MAX_ATTACHMENTS - itemsRef.current.length;
    if (room <= 0) {
      setNote(`Ya hay ${MAX_ATTACHMENTS} capturas adjuntas. Quitá una para agregar otra.`);
      return;
    }
    setNote(images.length > room ? `Solo entran ${MAX_ATTACHMENTS} capturas por mensaje.` : "");
    const shrunk = await Promise.all(images.slice(0, room).map(shrinkImage));
    setAttachments([
      ...itemsRef.current,
      ...shrunk.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) })),
    ]);
  }

  function removeAttachment(id: string) {
    const gone = itemsRef.current.find((i) => i.id === id);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    setNote("");
    setAttachments(itemsRef.current.filter((i) => i.id !== id));
  }

  // Pegar una captura con Ctrl+V desde cualquier parte de la página.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.some((f) => ACCEPTED_IMAGE_TYPES.includes(f.type))) {
        e.preventDefault();
        void addFiles(files);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // addFiles solo usa refs y setters, que no cambian entre renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSend = !busy && text.trim().length >= 2;

  function send() {
    if (!canSend) return;
    onSend(itemsRef.current.map((i) => i.file));
    // Las miniaturas pasan al mensaje enviado; se limpia el cuadro.
    setAttachments([]);
    setNote("");
    if (areaRef.current) areaRef.current.style.height = "auto";
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  const angle = angles.find((a) => a.id === settings.angleId);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void addFiles(Array.from(e.dataTransfer.files));
      }}
      className={`glass flex flex-col gap-2 p-3 transition ${dragging ? "ring-2 ring-white/50" : ""}`}
    >
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-1 pt-1">
          {items.map((i) => (
            <li key={i.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.previewUrl} alt={i.file.name} className="h-16 w-auto rounded-lg border border-white/15 object-cover" />
              <button
                type="button"
                onClick={() => removeAttachment(i.id)}
                aria-label={`Quitar ${i.file.name}`}
                className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full border border-white/25 bg-[#141414] text-[10px] text-white/80 hover:bg-white/20"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        ref={areaRef}
        data-composer
        value={text}
        rows={1}
        maxLength={4000}
        placeholder="Contá tu idea o pedí un cambio… (pegá una captura con Ctrl+V)"
        onChange={(e) => onText(e.target.value)}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
        }}
        onKeyDown={onKeyDown}
        className="max-h-[200px] w-full resize-none bg-transparent px-2 py-1.5 text-[0.95rem] text-white outline-none placeholder:text-white/40"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Adjuntar capturas de inspiración"
          title="Adjuntar capturas de inspiración"
          className="flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg leading-none text-white/80 transition hover:bg-white/10"
        >
          +
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

        <Popover triggerClassName={pillClass} trigger={<><span>Ángulo</span><span className="text-white">{angle ? angle.name.split(" — ")[0] : "libre"}</span><span className="text-white/40">▾</span></>}>
          {(close) => (
            <OptionList
              value={settings.angleId}
              options={[
                { value: "", label: "Libre", hint: "La IA elige el enfoque" },
                ...angles.map((a) => ({
                  value: a.id,
                  label: a.name,
                  // La cuenta de flyers ya hechos por ángulo, para ver de un vistazo qué falta.
                  hint:
                    a.total === 0
                      ? `Sin flyers todavía${a.enabled ? "" : " · en espera"}`
                      : `${a.total} ${a.total === 1 ? "hecho" : "hechos"}${a.today > 0 ? ` · ${a.today} hoy` : ""}${a.enabled ? "" : " · en espera"}`,
                })),
              ]}
              onPick={(v) => {
                onSettings({ angleId: v });
                close();
              }}
            />
          )}
        </Popover>

        <Popover triggerClassName={pillClass} trigger={<><AspectIcon ratio={settings.format} /><span className="text-white">{settings.format}</span><span className="text-white/40">▾</span></>}>
          {(close) => (
            <OptionList
              value={settings.format}
              options={ASPECT_RATIOS.map((r) => ({ value: r, label: FORMAT_INFO[r].label, hint: FORMAT_INFO[r].hint, icon: <AspectIcon ratio={r} /> }))}
              onPick={(v) => {
                onSettings({ format: v });
                close();
              }}
            />
          )}
        </Popover>

        <Popover triggerClassName={pillClass} trigger={<><span className="text-white">{tierShort(settings.tier)}</span><span className="text-white/40">▾</span></>}>
          {(close) => (
            <OptionList
              value={settings.tier}
              options={(Object.keys(IMAGE_MODELS) as ImageTier[]).map((t) => ({
                value: t,
                label: IMAGE_MODELS[t].label,
                hint: `~US$ ${imageCost(t, settings.size)} por imagen en ${settings.size}`,
              }))}
              onPick={(v) => {
                onSettings({ tier: v });
                close();
              }}
            />
          )}
        </Popover>

        <Popover triggerClassName={pillClass} trigger={<><span className="text-white">{settings.size}</span><span className="text-white/40">▾</span></>}>
          {(close) => (
            <OptionList
              value={settings.size}
              options={(["1K", "2K", "4K"] as ImageSize[]).map((s) => ({
                value: s,
                label: s,
                hint: `~US$ ${imageCost(settings.tier, s)} por imagen`,
              }))}
              onPick={(v) => {
                onSettings({ size: v });
                close();
              }}
            />
          )}
        </Popover>

        <Popover triggerClassName={pillClass} trigger={<><span className="text-white">×{settings.count}</span><span className="text-white/40">▾</span></>}>
          {(close) => (
            <OptionList
              value={String(settings.count)}
              options={[1, 2, 3, 4].map((n) => ({
                value: String(n),
                label: `${n} ${n === 1 ? "variación" : "variaciones"}`,
                hint: "por cada pedido",
              }))}
              onPick={(v) => {
                onSettings({ count: Number(v) });
                close();
              }}
            />
          )}
        </Popover>

        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Enviar"
          className="btn ml-auto flex size-9 items-center justify-center !rounded-full !p-0 text-base"
        >
          ↑
        </button>
      </div>
      {note && <p className="px-2 text-xs text-white/60">{note}</p>}
    </div>
  );
}
