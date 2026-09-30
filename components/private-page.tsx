import { redirect } from "next/navigation";
import { BudgetApp } from "@/components/budget-app";
import { loadData } from "@/lib/data";
import { AccessError, configured } from "@/lib/supabase/server";
import type { Screen } from "@/types";
export async function PrivatePage({
  screen,
  month,
}: {
  screen: Screen;
  month?: string;
}) {
  if (!configured()) redirect("/login");
  let data;
  try {
    data = await loadData();
  } catch (e) {
    if (e instanceof AccessError) redirect("/login");
    throw e;
  }
  return <BudgetApp initialData={data} screen={screen} initialMonth={month} />;
}
