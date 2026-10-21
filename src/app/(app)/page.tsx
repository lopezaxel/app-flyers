import { CoverageCard } from "./coverage-card";
import { SpendBar } from "./spend-bar";
import { getMonthUsage } from "@/lib/usage";

export default async function Home() {
  const usage = await getMonthUsage();
  return (
    <>
      <h1 className="text-xl font-semibold">Panel</h1>
      <SpendBar usage={usage} />
      <CoverageCard />
    </>
  );
}
