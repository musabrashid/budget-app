import { describe, it, expect } from "vitest";
import { createDemo } from "@/lib/demo";
import {
  calculateBudgetPercentage,
  calculateBudgetRemaining,
  calculateCategorySpend,
  calculateMonthlyBudget,
  calculateMonthProjection,
  applyCategoryRules,
  categorizeTransaction,
  includedInBudget,
  budgetStatus,
  recommendBudgets,
} from "@/lib/budget/logic";
import type { Rule } from "@/types";
const data = createDemo(new Date("2026-09-15T18:00:00Z"));
const rule: Rule = {
  id: "r",
  rule_type: "merchant_contains",
  match_value: "whole foods",
  category_id: data.categories[2].id,
  priority: 100,
  active: true,
  exclude_from_budget: false,
};
describe("budget math", () => {
  it("calculates percentages and unbudgeted state", () => {
    expect(calculateBudgetPercentage(500, 343)).toBeCloseTo(68.6);
    expect(calculateBudgetPercentage(0, 100)).toBeNull();
    expect(calculateBudgetPercentage(100, 120)).toBe(120);
  });
  it("keeps negative remaining amounts and cents exact", () => {
    expect(calculateBudgetRemaining(700, 801.93)).toBe(-101.93);
    expect(calculateBudgetRemaining(0.3, 0.1)).toBe(0.2);
  });
  it("describes all four thresholds with text", () => {
    expect([74, 75, 89, 90, 99, 100].map((s) => budgetStatus(100, s))).toEqual([
      "On track",
      "Watch",
      "Watch",
      "Near limit",
      "Near limit",
      "Over budget",
    ]);
  });
  it("includes purchases and subtracts refunds", () => {
    expect(calculateCategorySpend(data, data.categories[6].id, "2026-09")).toBe(
      -183.04,
    );
    expect(calculateMonthlyBudget(data, "2026-09").spent).toBe(4787.18);
  });
  it("excludes transfer and credit card repayment", () => {
    expect(
      includedInBudget(data.transactions.at(-1)!, data.accounts, true),
    ).toBe(false);
    const t = {
      ...data.transactions[0],
      plaid_primary_category: "TRANSFER_OUT",
    };
    expect(includedInBudget(t, data.accounts, true)).toBe(false);
  });
  it("respects manual inclusion and account exclusion", () => {
    const t = { ...data.transactions.at(-1)!, budget_override: true };
    expect(includedInBudget(t, data.accounts, true)).toBe(true);
    expect(
      includedInBudget(
        { ...t, account_id: "demo-savings" },
        data.accounts,
        true,
      ),
    ).toBe(false);
  });
  it("never counts income as a refund", () => {
    expect(
      includedInBudget(
        { ...data.transactions[0], amount: -1000, transaction_type: "income" },
        data.accounts,
        true,
      ),
    ).toBe(false);
  });
  it("respects the pending toggle without double counting posted entries", () => {
    expect(
      calculateMonthlyBudget(
        {
          ...data,
          preferences: { ...data.preferences, include_pending: false },
        },
        "2026-09",
      ).spent,
    ).toBe(3985.25);
  });
  it("never adds mixed currencies to a USD budget", () => {
    expect(
      includedInBudget(
        { ...data.transactions[0], currency: "EUR" },
        data.accounts,
        true,
      ),
    ).toBe(false);
  });
  it("honors manual exclusion and removed rows", () => {
    expect(
      includedInBudget(
        { ...data.transactions[0], budget_override: false },
        data.accounts,
        true,
      ),
    ).toBe(false);
    expect(
      includedInBudget(
        { ...data.transactions[0], removed: true },
        data.accounts,
        true,
      ),
    ).toBe(false);
  });
  it("supports specific month override without changing recurring limits", () => {
    const modified = {
      ...data,
      budgets: [
        {
          id: "b",
          category_id: data.categories[0].id,
          month: "2026-09-01",
          limit_amount: 3000,
          rollover_enabled: false,
        },
      ],
    };
    expect(calculateMonthlyBudget(modified, "2026-09").budget).toBe(6900);
    expect(calculateMonthlyBudget(modified, "2026-08").budget).toBe(6000);
  });
  it("projects from elapsed days in the configured timezone", () => {
    expect(
      calculateMonthProjection(
        2500,
        "2026-09",
        new Date("2026-09-15T18:00:00Z"),
      ),
    ).toBe(5000);
    expect(
      calculateMonthProjection(
        2500,
        "2026-08",
        new Date("2026-09-15T18:00:00Z"),
      ),
    ).toBe(2500);
    expect(
      calculateMonthProjection(0, "2026-10", new Date("2026-09-15T18:00:00Z")),
    ).toBeNull();
    expect(
      calculateMonthProjection(
        100,
        "2026-09",
        new Date("2026-10-01T01:00:00Z"),
        "America/Chicago",
      ),
    ).toBe(100);
  });
  it("recommends optional budgets only from completed months", () => {
    const suggestions = recommendBudgets(data, "2026-09");
    expect(suggestions.find((s) => s.name === "Housing")?.suggested).toBe(1825);
    expect(
      recommendBudgets(
        {
          ...data,
          transactions: data.transactions.filter((t) =>
            t.transaction_date.startsWith("2026-09"),
          ),
        },
        "2026-09",
      ),
    ).toEqual([]);
  });
});
describe("archive behavior", () => {
  it("preserves spending while suspending recurring allocation", () => {
    const archived = {
      ...data,
      categories: data.categories.map((c) =>
        c.name === "Groceries" ? { ...c, active: false } : c,
      ),
    };
    expect(calculateMonthlyBudget(archived, "2026-09").spent).toBe(4787.18);
    expect(calculateMonthlyBudget(archived, "2026-09").budget).toBe(5500);
  });
});
describe("categorization", () => {
  it("matches case-insensitive contains, equals, and description rules", () => {
    const t = data.transactions[1];
    expect(applyCategoryRules(t, [rule])?.id).toBe("r");
    expect(
      applyCategoryRules(t, [
        {
          ...rule,
          rule_type: "merchant_equals",
          match_value: "Whole Foods Market",
        },
      ])?.id,
    ).toBe("r");
    expect(
      applyCategoryRules(t, [
        { ...rule, rule_type: "description_contains", match_value: "FOODS" },
      ])?.id,
    ).toBe("r");
    expect(applyCategoryRules(t, [{ ...rule, active: false }])).toBeUndefined();
  });
  it("uses manual override before prioritized rules, classification, and Plaid", () => {
    const t = data.transactions[1];
    expect(
      categorizeTransaction(
        { ...t, user_category_id: data.categories[4].id },
        [rule],
        data.categories,
      ),
    ).toBe(data.categories[4].id);
    expect(categorizeTransaction(t, [rule], data.categories)).toBe(
      rule.category_id,
    );
    expect(categorizeTransaction(t, [], data.categories)).toBe(t.category_id);
    expect(
      categorizeTransaction(
        {
          ...t,
          category_id: null,
          plaid_detailed_category: "FOOD_AND_DRINK_GROCERIES",
        },
        [],
        data.categories,
      ),
    ).toBe(data.categories[1].id);
  });
  it("preserves default mapping after a category rename", () => {
    const categories = data.categories.map((c) =>
      c.name === "Groceries" ? { ...c, name: "My Food", slug: "my-food" } : c,
    );
    expect(
      categorizeTransaction(
        {
          ...data.transactions[1],
          category_id: null,
          plaid_detailed_category: "FOOD_AND_DRINK_GROCERIES",
        },
        [],
        categories,
      ),
    ).toBe(data.categories[1].id);
  });
  it("takes lower priority first and excludes rule-based transfers", () => {
    const t = data.transactions[1];
    const first = {
      ...rule,
      id: "first",
      priority: 1,
      category_id: data.categories[8].id,
      exclude_from_budget: true,
    };
    expect(applyCategoryRules(t, [rule, first])?.id).toBe("first");
    expect(includedInBudget(t, data.accounts, true, [first])).toBe(false);
    expect(
      includedInBudget({ ...t, budget_override: true }, data.accounts, true, [
        first,
      ]),
    ).toBe(true);
  });
});
