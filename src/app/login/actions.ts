"use server";

import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

export type LoginState = { error?: string } | undefined;

const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 30;

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function isBlocked(ip: string) {
  const { rows } = await query<{ ip_fails: number; all_fails: number }>(
    `select
       count(*) filter (where ip = $1)::int as ip_fails,
       count(*)::int as all_fails
     from app_flyers.login_attempts
     where ok = false and at > now() - interval '15 minutes'`,
    [ip],
  );
  return rows[0].ip_fails >= MAX_FAILS_PER_IP || rows[0].all_fails >= MAX_FAILS_GLOBAL;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const expectedUser = process.env.APP_USER;
  const hashB64 = process.env.APP_PASSWORD_HASH_B64;
  if (!expectedUser || !hashB64) return { error: "Login sin configurar en el servidor." };

  // Falla cerrado: si no se puede verificar el límite, no se deja entrar.
  try {
    if (await isBlocked(ip)) return { error: "Demasiados intentos. Probá en 15 minutos." };
  } catch {
    return { error: "No se pudo verificar el acceso. Probá de nuevo." };
  }

  const user = String(formData.get("user") ?? "");
  const password = String(formData.get("password") ?? "");

  // Siempre se corre bcrypt y se compara el usuario, así no se filtra cuál de los dos falló.
  const hash = Buffer.from(hashB64, "base64").toString("utf8");
  const passwordOk = await bcrypt.compare(password, hash);
  const ok = safeEqual(user, expectedUser) && passwordOk;

  await query("insert into app_flyers.login_attempts (ip, ok) values ($1, $2)", [ip, ok]);
  if (!ok) return { error: "Usuario o contraseña incorrectos." };

  await query("delete from app_flyers.login_attempts where at < now() - interval '7 days'");

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(expectedUser), sessionCookieOptions);
  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
