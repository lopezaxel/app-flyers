import { Nav } from "./nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <Nav />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">{children}</div>
    </>
  );
}
