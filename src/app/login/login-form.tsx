"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm text-white/70">
        Usuario
        <input name="user" autoComplete="username" required className="field" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-white/70">
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-white/90">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn mt-2">
        {pending ? "Verificando…" : "Entrar"}
      </button>
    </form>
  );
}
