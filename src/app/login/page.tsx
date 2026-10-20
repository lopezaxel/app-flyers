import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="glass w-full max-w-sm p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">app-flyers</p>
        <h1 className="mt-2 mb-8 text-2xl font-semibold">Ingresar</h1>
        <LoginForm />
      </div>
    </main>
  );
}
