"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "../login/actions";

const links = [
  { href: "/", label: "Panel" },
  { href: "/generar", label: "Generar" },
  { href: "/flyers", label: "Flyers" },
  { href: "/marca", label: "Marca" },
  { href: "/angulos", label: "Ángulos" },
  { href: "/assets", label: "Assets" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="glass sticky top-3 z-10 mx-auto mt-3 flex w-[calc(100%-1.5rem)] max-w-4xl items-center justify-between gap-4 px-4 py-2.5">
      <nav className="flex items-center gap-1">
        <span className="mr-3 text-sm font-semibold tracking-wide">app-flyers</span>
        {links.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                active ? "bg-white/15 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <form action={logout}>
        <button className="btn-ghost">Salir</button>
      </form>
    </header>
  );
}
