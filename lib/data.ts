import "server-only";
import { requireUser } from "@/lib/supabase/server";
import type { AppData, Transaction } from "@/types";
import {
  calculateMonthlyBudget,
  monthInZone,
  shiftMonth,
} from "@/lib/budget/logic";
export async function loadData(): Promise<AppData> {
  const { db, user } = await requireUser();
  const init = await db.rpc("initialize_budget");
  if (init.error) throw new Error("Could not initialize your budget.");
  const tables = [
    "categories",
    "budgets",
    "accounts",
    "institutions",
    "transaction_category_rules",
    "user_preferences",
  ] as const;
  const results = await Promise.all(
    tables.map((table) => db.from(table).select("*")),
  );
  if (results.some((r) => r.error))
    throw new Error("Could not load your budget. Please try again.");
  // Supabase caps response rows. Page through transactions rather than silently truncating history.
  const transactions: Transaction[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await db
      .from("transactions")
      .select("*")
      .eq("removed", false)
      .order("id")
      .range(offset, offset + 999);
    if (page.error) throw new Error("Could not load transactions.");
    transactions.push(...page.data);
    if (page.data.length < 1000) break;
  }
  const [categories, budgets, accounts, institutions, rules, prefs] =
    results.map((r) => r.data!);
  const data: AppData = {
    categories,
    budgets,
    transactions,
    accounts,
    institutions,
    rules,
    preferences: prefs[0],
    demo: false,
    plaidReady: Boolean(
      process.env.PLAID_CLIENT_ID &&
      process.env.PLAID_SECRET &&
      process.env.PLAID_TOKEN_ENCRYPTION_KEY &&
      (process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY),
    ),
    email: user.email ?? null,
    loadedAt: new Date().toISOString(),
  };
  const current = monthInZone(
    new Date(data.loadedAt),
    data.preferences.timezone,
  ).month;
  const months = new Set([
    current,
    shiftMonth(current, 1),
    shiftMonth(current, -1),
    ...transactions.map((t) => t.transaction_date.slice(0, 7)),
    ...budgets.map((b) => String(b.month).slice(0, 7)),
  ]);
  data.monthlySummaries = Object.fromEntries(
    [...months].map((month) => [month, calculateMonthlyBudget(data, month)]),
  );
  return data;
}
