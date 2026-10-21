"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Miniatura que, al tocarla, abre la imagen en grande sobre la app, con el fondo difuminado. */
export function ImageLightbox({
  src,
  alt,
  downloadHref,
  className = "w-full rounded-xl object-contain",
}: {
  src: string;
  alt: string;
  downloadHref?: string;
  /** Clases de la miniatura. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label={`Ver en grande: ${alt}`} className="block w-full cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} />
      </button>
      {open &&
        // En un portal: las tarjetas .glass usan backdrop-filter y recortarían un modal "fixed" dentro de ellas.
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xl sm:p-8"
          >
            <div className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={alt} className="max-h-[calc(100dvh-8rem)] max-w-full rounded-xl object-contain shadow-2xl" />
              <div className="flex gap-2">
                {downloadHref && (
                  <a href={downloadHref} download className="btn-ghost">
                    Descargar
                  </a>
                )}
                <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="btn-ghost">
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
