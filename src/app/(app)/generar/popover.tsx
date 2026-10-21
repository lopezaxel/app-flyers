"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Menú flotante propio (no el desplegable nativo): se cierra al hacer clic afuera o con Escape. */
export function Popover({
  trigger,
  children,
  align = "left",
  placement = "top",
  triggerClassName = "",
  disabled = false,
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  /** Hacia dónde se abre el menú: "top" para el cuadro de escritura, "bottom" para el encabezado. */
  placement?: "top" | "bottom";
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute z-30 max-h-96 min-w-64 overflow-y-auto rounded-xl border border-white/14 bg-[#141414] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] ${
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2"
          } ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export const pillClass =
  "flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-50";

/** Lista de opciones dentro de un Popover (una sola elección). */
export function OptionList<T extends string>({
  value,
  options,
  onPick,
}: {
  value: T;
  options: { value: T; label: string; hint?: string; icon?: ReactNode }[];
  onPick: (value: T) => void;
}) {
  return (
    <ul>
      {options.map((o) => (
        <li key={o.value}>
          <button
            type="button"
            onClick={() => onPick(o.value)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/10 ${
              o.value === value ? "bg-white/[0.07]" : ""
            }`}
          >
            {o.icon && <span className="flex w-5 shrink-0 justify-center">{o.icon}</span>}
            <span className="flex-1">
              <span className="block text-white/90">{o.label}</span>
              {o.hint && <span className="block text-xs text-white/50">{o.hint}</span>}
            </span>
            {o.value === value && <span className="text-xs text-white/70">✓</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
