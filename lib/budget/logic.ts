import type { Account, AppData, Category, Rule, Transaction } from "@/types";
import { PLAID_CATEGORY_MAP, slugify } from "@/lib/categories/defaults";
export const cents = (amount: number) =>
  Math.round((amount + Math.sign(amount) * Number.EPSILON) * 100);
export const moneyRound = (amount: number) => cents(amount) / 100;
export const calculateBudgetRemaining = (budget: number, spent: number) =>
  (cents(budget) - cents(spent)) / 100;
export const calculateBudgetPercentage = (budget: number, spent: number) =>
  budget > 0 ? (spent / budget) * 100 : null;
export function budgetStatus(budget: number, spent: number) {
  const p = calculateBudgetPercentage(budget, spent);
  return p === null
    ? "No budget"
    : p >= 100
      ? "Over budget"
      : p >= 90
        ? "Near limit"
        : p >= 75
          ? "Watch"
          : "On track";
}
export function isTransfer(
  t: Pick<
    Transaction,
    "transaction_type" | "plaid_primary_category" | "plaid_detailed_category"
  >,
) {
  return (
    t.transaction_type === "transfer" ||
    ["TRANSFER_IN", "TRANSFER_OUT"].includes(t.plaid_primary_category ?? "") ||
    /LOAN_PAYMENTS_CREDIT_CARD_PAYMENT|TRANSFER_/.test(
      t.plaid_detailed_category ?? "",
    )
  );
}
export const isRefund = (t: Pick<Transaction, "amount" | "transaction_type">) =>
  t.amount < 0 &&
  t.transaction_type !== "income" &&
  t.transaction_type !== "transfer";
export function applyCategoryRules(
  t: Pick<Transaction, "merchant_name" | "original_name">,
  rules: Rule[],
) {
  return [...rules]
    .filter((r) => r.active)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .find((r) => {
      const match = r.match_value.trim().toLocaleLowerCase("en-US");
      const merchant = (t.merchant_name ?? t.original_name).toLocaleLowerCase(
        "en-US",
      );
      if (!match) return false;
      return r.rule_type === "merchant_equals"
        ? merchant === match
        : r.rule_type === "merchant_contains"
          ? merchant.includes(match)
          : t.original_name.toLocaleLowerCase("en-US").includes(match);
    });
}
export function categorizeTransaction(
  t: Pick<
    Transaction,
    | "merchant_name"
    | "original_name"
    | "user_category_id"
    | "category_id"
    | "plaid_primary_category"
    | "plaid_detailed_category"
  >,
  rules: Rule[],
  categories: Category[],
) {
  if (t.user_category_id) return t.user_category_id;
  const rule = applyCategoryRules(t, rules);
  if (rule) return rule.category_id;
  if (t.category_id && categories.some((c) => c.id === t.category_id))
    return t.category_id;
  const detail = t.plaid_detailed_category ?? "";
  const name = detail.includes("GROCERIES")
    ? "Groceries"
    : detail.includes("RENT")
      ? "Housing"
      : detail.includes("EDUCATION")
        ? "Education"
        : (PLAID_CATEGORY_MAP[t.plaid_primary_category ?? ""] ?? "Other");
  return (
    categories.find((c) => c.is_default && c.default_key === slugify(name))
      ?.id ??
    categories.find((c) => c.default_key === "other")?.id ??
    null
  );
}
export function includedInBudget(
  t: Transaction,
  accounts: Account[],
  includePending: boolean,
  rules: Rule[] = [],
) {
  if (
    t.currency !== "USD" ||
    t.removed ||
    (!includePending && t.pending) ||
    !accounts.find((a) => a.id === t.account_id)?.include_in_budget
  )
    return false;
  if (t.budget_override !== null) return t.budget_override;
  if (
    t.excluded_from_budget ||
    applyCategoryRules(t, rules)?.exclude_from_budget
  )
    return false;
  return !isTransfer(t) && t.transaction_type !== "income";
}
export function calculateCategorySpend(
  data: AppData,
  categoryId: string,
  month: string,
) {
  return (
    data.transactions
      .filter(
        (t) =>
          t.transaction_date.startsWith(month) &&
          includedInBudget(
            t,
            data.accounts,
            data.preferences.include_pending,
            data.rules,
          ) &&
          categorizeTransaction(t, data.rules, data.categories) === categoryId,
      )
      .reduce((sum, t) => sum + cents(t.amount), 0) / 100
  );
}
export function calculateMonthlyBudget(data: AppData, month: string) {
  const categories = data.categories.map((c) => {
    const budget = Number(
      data.budgets.find(
        (b) => b.category_id === c.id && b.month === `${month}-01`,
      )?.limit_amount ?? (c.active ? c.monthly_budget : 0),
    );
    const spent = calculateCategorySpend(data, c.id, month);
    return {
      ...c,
      budget,
      spent,
      remaining: calculateBudgetRemaining(budget, spent),
      percentage: calculateBudgetPercentage(budget, spent),
      status: budgetStatus(budget, spent),
    };
  });
  const spent = categories.reduce((s, c) => s + cents(c.spent), 0) / 100;
  const budget = categories.reduce((s, c) => s + cents(c.budget), 0) / 100;
  return {
    categories,
    spent,
    budget,
    remaining: calculateBudgetRemaining(budget, spent),
    percentage: calculateBudgetPercentage(budget, spent),
  };
}
export function monthInZone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  return { month: `${get("year")}-${get("month")}`, day: Number(get("day")) };
}
export function calculateMonthProjection(
  spent: number,
  month: string,
  now = new Date(),
  timezone = "America/Chicago",
) {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const current = monthInZone(now, timezone);
  if (month > current.month) return null;
  const elapsed = month < current.month ? days : Math.max(1, current.day);
  return moneyRound((spent / elapsed) * days);
}
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
export function recommendBudgets(data: AppData, currentMonth: string) {
  const available = [
    ...new Set(
      data.transactions
        .filter((t) => !t.removed)
        .map((t) => t.transaction_date.slice(0, 7)),
    ),
  ]
    .filter((m) => m < currentMonth)
    .sort()
    .slice(-3);
  if (available.length < 2) return [];
  return data.categories
    .filter((c) => c.active)
    .map((c) => ({
      category_id: c.id,
      name: c.name,
      months: available.length,
      suggested: Math.max(
        0,
        Math.ceil(
          available.reduce(
            (sum, m) => sum + calculateCategorySpend(data, c.id, m),
            0,
          ) /
            available.length /
            25,
        ) * 25,
      ),
    }));
}
