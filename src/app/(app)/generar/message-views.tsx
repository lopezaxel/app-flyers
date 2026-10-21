"use client";

import { useState, type ReactNode } from "react";
import { angleLabel } from "@/lib/angle-label";
import type { ChatFlyer, CoverageNote, ProposalContent, ResultContent, UserContent } from "@/lib/chat-types";
import type { Assessment, Concept } from "@/lib/gemini/director";
import { IMAGE_MODELS, estimateImagesCostUsd, type ImageSize, type ImageTier } from "@/lib/gemini/models";

function Avatar() {
  return (
    <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold tracking-wide text-white/80">
      IA
    </span>
  );
}

function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar />
      <div className="flex min-w-0 flex-1 flex-col gap-3">{children}</div>
    </div>
  );
}

export function UserBubble({ content }: { content: UserContent }) {
  const urls = content.previewUrls ?? content.attachmentIds.map((id) => `/api/img/inspiration/${id}`);
  const s = content.settings;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex max-w-[85%] flex-col gap-2 rounded-2xl rounded-br-md border border-white/12 bg-white/10 px-4 py-3">
        {urls.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {urls.map((u) => (
              <li key={u}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="Captura de inspiración" className="h-24 w-auto rounded-lg border border-white/15 object-cover" />
              </li>
            ))}
          </ul>
        )}
        <p className="whitespace-pre-wrap text-[0.95rem]">{content.text}</p>
      </div>
      <p className="px-1 font-mono text-[11px] text-white/40">
        {s.angleName ? s.angleName.split(" — ")[0] : "Ángulo libre"} · {s.format} · {IMAGE_MODELS[s.tier].label.split(" · ")[0]}{" "}
        {s.size} · ×{s.count}
      </p>
    </div>
  );
}

export function ErrorView({ text }: { text: string }) {
  return (
    <AssistantRow>
      <p role="alert" className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white/90">
        {text}
      </p>
    </AssistantRow>
  );
}

export function ReplyView({ text }: { text: string }) {
  return (
    <AssistantRow>
      <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-white/90">{text}</p>
    </AssistantRow>
  );
}

export function PendingBubble({ label }: { label: string }) {
  return (
    <AssistantRow>
      <p className="flex items-center gap-2 text-sm text-white/60">
        <span className="inline-flex gap-1" aria-hidden>
          <span className="size-1.5 animate-pulse rounded-full bg-white/60" />
          <span className="size-1.5 animate-pulse rounded-full bg-white/60 [animation-delay:150ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-white/60 [animation-delay:300ms]" />
        </span>
        {label}
      </p>
    </AssistantRow>
  );
}

const VERDICT: Record<Assessment["verdict"], { label: string; hint: string }> = {
  fits: { label: "Va bien", hint: "La idea funciona tal cual" },
  adjust: { label: "Hay que ajustarla", hint: "Buena base, pero conviene corregir el mensaje o el enfoque" },
  rethink: { label: "Conviene replantearla", hint: "Hay un enfoque mejor para esta idea" },
};

/** Lo que piensa el director de la idea, comparada con el producto real: veredicto, recomendación y riesgos. */
function AssessmentCard({
  assessment,
  recommendedAngle,
  onUseAngle,
  busy,
}: {
  assessment: Assessment;
  /** Ángulo recomendado distinto del elegido, para ofrecer rehacer con él. */
  recommendedAngle: { id: string; name: string } | null;
  onUseAngle: (angleId: string, angleName: string) => void;
  busy: boolean;
}) {
  const verdict = VERDICT[assessment.verdict];
  return (
    <div className="rounded-xl border border-white/12 bg-white/[0.05] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/95">
          {verdict.label}
        </span>
        <span className="text-xs text-white/45">{verdict.hint}</span>
      </div>
      <p className="mt-2.5 text-white/90">{assessment.reason}</p>
      {assessment.recommendation && (
        <p className="mt-2 text-white/75">
          <span className="text-white/95">Mi recomendación: </span>
          {assessment.recommendation}
        </p>
      )}
      {recommendedAngle && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onUseAngle(recommendedAngle.id, recommendedAngle.name)}
          className="btn-ghost mt-3 !py-1.5 text-xs"
        >
          Rehacer con el ángulo {angleLabel(recommendedAngle.name)}
        </button>
      )}
      {(assessment.meaning || assessment.supports.length > 0 || assessment.risks.length > 0) && (
        <details className="mt-3 text-white/70">
          <summary className="cursor-pointer text-xs text-white/50">Ver el razonamiento completo</summary>
          {assessment.meaning && (
            <p className="mt-2">
              <span className="text-white/90">Lo que transmite tu referencia: </span>
              {assessment.meaning}
            </p>
          )}
          {assessment.supports.length > 0 && (
            <div className="mt-2">
              <p className="text-white/90">Datos reales del producto que lo respaldan:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {assessment.supports.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {assessment.risks.length > 0 && (
            <div className="mt-2">
              <p className="text-white/90">Ojo con:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {assessment.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
    </div>
  );
}

/** Cuántos flyers lleva el ángulo elegido y cuáles todavía no se tocaron. Es un dato fijo, no una opinión de la IA. */
function CoverageBanner({ note }: { note: CoverageNote }) {
  const recent = [note.today > 0 && `${note.today} hoy`, note.yesterday > 0 && `${note.yesterday} ayer`].filter(Boolean).join(" · ");
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/75">
      <p>
        <span className="text-white/95">{angleLabel(note.angleName)}:</span>{" "}
        {note.total === 0
          ? "todavía no hiciste ningún flyer de este ángulo."
          : `ya hiciste ${note.total} ${note.total === 1 ? "flyer" : "flyers"} de este ángulo${recent ? ` (${recent})` : ""}.`}
      </p>
      {note.untouched.length > 0 && (
        <p className="mt-1 text-white/55">Todavía sin flyers: {note.untouched.map(angleLabel).join(" · ")}.</p>
      )}
    </div>
  );
}

type GenerateArgs = { proposalId: string; concepts: Concept[]; restrictions: string };

export function ProposalView({
  messageId,
  content,
  tier,
  size,
  busy,
  recommendedAngle,
  onGenerate,
  onUseAngle,
}: {
  messageId: string;
  content: ProposalContent;
  tier: ImageTier;
  size: ImageSize;
  busy: boolean;
  recommendedAngle: { id: string; name: string } | null;
  onGenerate: (args: GenerateArgs) => void;
  onUseAngle: (angleId: string, angleName: string) => void;
}) {
  const [concepts, setConcepts] = useState<Concept[]>(content.concepts);
  const [selected, setSelected] = useState<boolean[]>(() => content.concepts.map(() => true));
  const [restrictions, setRestrictions] = useState(content.restrictionsEn);
  const chosen = concepts.filter((_, i) => selected[i]);
  const estimate = estimateImagesCostUsd(tier, size, chosen.length);

  function patch(i: number, change: Partial<Concept>) {
    setConcepts((all) => all.map((c, j) => (j === i ? { ...c, ...change } : c)));
  }

  return (
    <AssistantRow>
      <p className="whitespace-pre-wrap text-[0.95rem] text-white/90">{content.reply}</p>

      {content.assessment && (
        <AssessmentCard
          assessment={content.assessment}
          recommendedAngle={recommendedAngle}
          onUseAngle={onUseAngle}
          busy={busy}
        />
      )}

      {content.coverage && <CoverageBanner note={content.coverage} />}

      {content.analysis.summary && (
        <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
          <summary className="cursor-pointer text-white/70">Lectura de tu referencia</summary>
          <p className="mt-2 whitespace-pre-wrap text-white/70">{content.analysis.summary}</p>
          {content.analysis.adaptations && (
            <p className="mt-2 whitespace-pre-wrap text-white/70">
              <span className="text-white/90">Ajustes por la marca: </span>
              {content.analysis.adaptations}
            </p>
          )}
          {content.analysis.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {content.analysis.tags.map((t) => (
                <span key={t} className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/60">
                  {t}
                </span>
              ))}
            </div>
          )}
        </details>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))" }}>
        {concepts.map((c, i) => (
          <section key={i} className={`glass flex flex-col gap-2.5 p-4 transition ${selected[i] ? "" : "opacity-50"}`}>
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={selected[i]}
                onChange={(e) => setSelected((s) => s.map((v, j) => (j === i ? e.target.checked : v)))}
                className="mt-1 size-4 accent-white"
              />
              <span>
                <span className="text-sm font-medium">
                  {i + 1}. {c.name}
                </span>
                <span className="mt-0.5 block text-xs text-white/55">{c.approach}</span>
              </span>
            </label>
            {c.base_flyer_id && (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-[11px] text-white/55">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/img/flyer/${c.base_flyer_id}`} alt="Flyer anterior" className="h-9 w-auto rounded" />
                <span>Refina un flyer anterior: lo usa como base y cambia solo lo pedido.</span>
              </div>
            )}
            {c.base_flyer_id && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-white/50">Cambios sobre el flyer anterior (en inglés)</summary>
                <textarea
                  className="field mt-2 font-mono text-xs"
                  rows={3}
                  value={c.changes_en ?? ""}
                  maxLength={1500}
                  onChange={(e) => patch(i, { changes_en: e.target.value })}
                />
              </details>
            )}
            <label className="flex flex-col gap-1 text-[11px] text-white/45">
              Titular
              <input className="field !px-2.5 !py-1.5 text-sm" value={c.headline} maxLength={120} onChange={(e) => patch(i, { headline: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-white/45">
              Bajada
              <input className="field !px-2.5 !py-1.5 text-sm" value={c.subheadline} maxLength={200} onChange={(e) => patch(i, { subheadline: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-white/45">
              Llamado a la acción
              <input className="field !px-2.5 !py-1.5 text-sm" value={c.cta} maxLength={60} onChange={(e) => patch(i, { cta: e.target.value })} />
            </label>
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-white/50">Prompt visual (en inglés)</summary>
              <textarea
                className="field mt-2 font-mono text-xs"
                rows={9}
                value={c.visual_prompt}
                maxLength={4000}
                onChange={(e) => patch(i, { visual_prompt: e.target.value })}
              />
            </details>
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-white/50">Texto del posteo</summary>
              <textarea
                className="field mt-2 text-sm"
                rows={4}
                value={c.caption}
                maxLength={1500}
                onChange={(e) => patch(i, { caption: e.target.value })}
              />
            </details>
            <button
              type="button"
              disabled={busy}
              onClick={() => onGenerate({ proposalId: messageId, concepts: [c], restrictions })}
              className="btn-ghost mt-1 self-start !py-1.5 text-xs"
            >
              Generar solo esta · ~US$ {estimateImagesCostUsd(tier, size, 1).toFixed(2)}
            </button>
          </section>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-white/50">Restricciones de marca que viajan en cada prompt (en inglés)</summary>
        <textarea
          className="field mt-2 font-mono text-xs"
          rows={7}
          value={restrictions}
          maxLength={4000}
          onChange={(e) => setRestrictions(e.target.value)}
        />
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || chosen.length === 0}
          onClick={() => onGenerate({ proposalId: messageId, concepts: chosen, restrictions })}
          className="btn px-5"
        >
          {`Generar ${chosen.length} ${chosen.length === 1 ? "flyer" : "flyers"}`}
        </button>
        <p className="font-mono text-xs text-white/50">
          {IMAGE_MODELS[tier].label.split(" · ")[0]} · {size} · ~US$ {estimate.toFixed(2)}
        </p>
      </div>
    </AssistantRow>
  );
}

export function ResultView({
  content,
  flyers,
  busy,
  regenerateCost,
  onRegenerate,
  onAskChanges,
}: {
  content: ResultContent;
  flyers: Record<string, ChatFlyer>;
  busy: boolean;
  /** Costo estimado de regenerar un flyer con el modelo y la resolución elegidos. */
  regenerateCost: number;
  onRegenerate: (flyerId: string) => void;
  onAskChanges: (flyerName: string) => void;
}) {
  const items = content.flyerIds.map((id) => flyers[id]).filter((f): f is ChatFlyer => Boolean(f));
  const total = items.reduce((sum, f) => sum + f.costUsd, 0);
  return (
    <AssistantRow>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))" }}>
        {items.map((f) => (
          <figure key={f.id} className="glass flex flex-col gap-2 p-3">
            {f.status === "done" ? (
              <a href={`/api/img/flyer/${f.id}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/img/flyer/${f.id}`} alt={f.headline || f.name} className="w-full rounded-xl object-contain" />
              </a>
            ) : (
              <div
                className="flex w-full items-center justify-center rounded-xl bg-white/5 text-sm text-white/50"
                style={{ aspectRatio: f.format.replace(":", " / ") }}
              >
                {f.status === "failed" ? "Falló esta variación" : "Generando…"}
              </div>
            )}
            <figcaption className="flex flex-col gap-2 text-xs text-white/60">
              <span className="truncate">{f.name || f.headline}</span>
              <span className="flex flex-wrap gap-1.5">
                {f.status === "done" && (
                  <a
                    href={`/api/img/flyer/${f.id}?download=1`}
                    download
                    className="rounded-full border border-white/15 px-2.5 py-1 text-white/80 transition hover:bg-white/10"
                  >
                    Descargar
                  </a>
                )}
                {f.status !== "pending" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRegenerate(f.id)}
                    title={`Otra tirada con el mismo prompt · ~US$ ${regenerateCost.toFixed(2)}`}
                    className="rounded-full border border-white/15 px-2.5 py-1 text-white/80 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {f.status === "failed" ? "↻ Reintentar" : "↻ Regenerar"}
                  </button>
                )}
                {f.status === "done" && (
                  <button
                    type="button"
                    onClick={() => onAskChanges(f.name || f.headline)}
                    className="rounded-full border border-white/15 px-2.5 py-1 text-white/80 transition hover:bg-white/10"
                  >
                    Pedir cambios
                  </button>
                )}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="font-mono text-xs text-white/45">
        {IMAGE_MODELS[content.tier].label.split(" · ")[0]} · {content.size} · US$ {total.toFixed(3)}. Pedime cambios cuando quieras: más
        minimalista, otro color de fondo, otro titular…
      </p>
      {content.errors.length > 0 && (
        <p className="text-xs text-white/60">
          {content.errors.length === 1 ? "Una variación falló" : `${content.errors.length} variaciones fallaron`}: {content.errors[0]}
        </p>
      )}
    </AssistantRow>
  );
}
