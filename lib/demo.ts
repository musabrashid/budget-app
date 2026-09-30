import { DEFAULT_CATEGORIES, slugify } from "@/lib/categories/defaults";
import { shiftMonth } from "@/lib/budget/logic";
import type { AppData, Transaction } from "@/types";
export function createDemo(now = new Date()): AppData {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const period = `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
  const categories = DEFAULT_CATEGORIES.map(([name, icon, budget], i) => ({
    id: `demo-category-${i}`,
    name,
    icon,
    slug: slugify(name),
    monthly_budget: budget,
    is_default: true,
    default_key: slugify(name),
    active: true,
    sort_order: i,
    parent_category_id: null,
  }));
  const spending = [
    2035, 342.94, 801.93, 376.45, 79.98, 377.78, -183.04, 580.09, 124.06, 12.17,
    95, 0, 0, 0, 0, 144.82,
  ];
  const merchants = [
    "Oakwood Apartments",
    "Whole Foods Market",
    "Café North",
    "Uber",
    "Everlane",
    "Alamo Drafthouse",
    "United Airlines refund",
    "One Medical",
    "ComEd",
    "iCloud+",
    "Local Food Bank",
    "Bank fee",
    "Bookshop",
    "Family",
    "Pet store",
    "Neighborhood Market",
  ];
  const transactions: Transaction[] = [];
  for (const [mi, p] of [
    period,
    shiftMonth(period, -1),
    shiftMonth(period, -2),
  ].entries())
    categories.forEach((c, i) => {
      if (!spending[i]) return;
      const amount =
        Math.round(
          spending[i] * (mi === 0 ? 1 : mi === 1 ? 0.923 : 0.87) * 100,
        ) / 100;
      transactions.push({
        id: `demo-t-${mi}-${i}`,
        plaid_transaction_id: `demo-${mi}-${i}`,
        account_id: i % 3 === 0 ? "demo-checking" : "demo-card",
        institution_id: "demo-bank",
        merchant_name: merchants[i],
        original_name: merchants[i].toUpperCase(),
        amount,
        currency: "USD",
        transaction_date: `${p}-${String(1 + ((i * 2) % 27)).padStart(2, "0")}`,
        authorized_date: null,
        pending: mi === 0 && i === 2,
        category_id: c.id,
        user_category_id: null,
        plaid_primary_category: null,
        plaid_detailed_category: null,
        transaction_type: amount < 0 ? "refund" : "purchase",
        excluded_from_budget: false,
        budget_override: null,
        notes: "",
        removed: false,
      });
    });
  transactions.push({
    ...transactions[0],
    id: "demo-transfer",
    plaid_transaction_id: "demo-transfer",
    merchant_name: "Credit card payment",
    original_name: "PAYMENT THANK YOU",
    amount: 1400,
    category_id: categories[15].id,
    transaction_type: "transfer",
    plaid_detailed_category: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
  });
  return {
    categories,
    budgets: [],
    transactions,
    accounts: [
      {
        id: "demo-checking",
        institution_id: "demo-bank",
        name: "Everyday Checking",
        mask: "4821",
        type: "depository",
        subtype: "checking",
        current_balance: 6238.19,
        available_balance: 6180.24,
        currency: "USD",
        include_in_budget: true,
      },
      {
        id: "demo-card",
        institution_id: "demo-bank",
        name: "Freedom Unlimited",
        mask: "9014",
        type: "credit",
        subtype: "credit card",
        current_balance: 1632.88,
        available_balance: 8367.12,
        currency: "USD",
        include_in_budget: true,
      },
      {
        id: "demo-savings",
        institution_id: "demo-bank",
        name: "Savings",
        mask: "2208",
        type: "depository",
        subtype: "savings",
        current_balance: 12400,
        available_balance: 12400,
        currency: "USD",
        include_in_budget: false,
      },
    ],
    institutions: [
      {
        id: "demo-bank",
        name: "Example Bank",
        last_synced_at: null,
        status: "demo",
      },
    ],
    rules: [],
    preferences: {
      include_pending: true,
      theme: "light",
      default_month: "current",
      timezone: "America/Chicago",
      onboarding_complete: false,
    },
    demo: true,
    plaidReady: false,
    email: null,
    loadedAt: now.toISOString(),
  };
}
