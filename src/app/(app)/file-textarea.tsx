"use client";

import { useRef } from "react";

/** Textarea que además permite cargar su contenido desde un archivo .md / .txt. */
export function FileTextarea({
  name,
  label,
  hint,
  defaultValue = "",
  rows = 12,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !ref.current) return;
    ref.current.value = await file.text();
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <label className="btn-ghost cursor-pointer">
          Cargar desde archivo
          <input type="file" accept=".md,.txt,text/markdown,text/plain" onChange={onFile} hidden />
        </label>
      </div>
      {hint && <p className="text-xs text-white/50">{hint}</p>}
      <textarea
        ref={ref}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="field font-mono text-sm leading-relaxed"
      />
    </div>
  );
}
