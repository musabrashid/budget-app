import { BudgetApp } from "@/components/budget-app";
import { createDemo } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  return (
    <BudgetApp
      initialData={createDemo()}
      screen="settings"
      initialMonth={month}
    />
  );
}
