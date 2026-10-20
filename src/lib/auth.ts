import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Para server components y server actions: corta si no hay sesión válida. */
export async function requireUser() {
  const store = await cookies();
  const user = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  return user;
}
