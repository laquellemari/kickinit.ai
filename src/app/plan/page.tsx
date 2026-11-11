import { PlanView } from "@/components/PlanView";

export const metadata = { title: "Your plan · kickinit" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).trim().slice(0, 1000);
  const mode = one(sp.mode) === "them" ? "them" : "you";
  const where = one(sp.where).trim().slice(0, 100) || "Miami";
  return <PlanView key={`${mode}|${where}|${q}`} q={q} mode={mode} where={where} />;
}
