export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  parent_category_id: string | null;
  is_default: boolean;
  default_key: string | null;
  active: boolean;
  sort_order: number;
  monthly_budget: number;
};
export type Budget = {
  id: string;
  category_id: string;
  month: string;
  limit_amount: number;
  rollover_enabled: boolean;
};
export type Account = {
  id: string;
  institution_id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
  currency: string;
  include_in_budget: boolean;
};
export type Institution = {
  id: string;
  name: string;
  last_synced_at: string | null;
  status: string;
};
export type Transaction = {
  id: string;
  plaid_transaction_id: string;
  account_id: string;
  institution_id: string;
  merchant_name: string | null;
  original_name: string;
  amount: number;
  currency: string;
  transaction_date: string;
  authorized_date: string | null;
  pending: boolean;
  category_id: string | null;
  user_category_id: string | null;
  plaid_primary_category: string | null;
  plaid_detailed_category: string | null;
  transaction_type: "purchase" | "refund" | "transfer" | "income";
  excluded_from_budget: boolean;
  budget_override: boolean | null;
  notes: string;
  removed: boolean;
};
export type Rule = {
  id: string;
  rule_type: "merchant_contains" | "merchant_equals" | "description_contains";
  match_value: string;
  category_id: string;
  priority: number;
  active: boolean;
  exclude_from_budget: boolean;
};
export type Preferences = {
  include_pending: boolean;
  theme: "light" | "dark" | "system";
  default_month: "current" | "last";
  timezone: string;
  onboarding_complete: boolean;
};
export type AppData = {
  monthlySummaries?: Record<string, MonthlySummary>;
  categories: Category[];
  budgets: Budget[];
  transactions: Transaction[];
  accounts: Account[];
  institutions: Institution[];
  rules: Rule[];
  preferences: Preferences;
  demo: boolean;
  plaidReady: boolean;
  email: string | null;
  loadedAt: string;
};
export type Screen =
  "dashboard" | "transactions" | "budgets" | "accounts" | "settings" | "trends";
export type MonthlySummary = {
  categories: (Category & {
    budget: number;
    spent: number;
    remaining: number;
    percentage: number | null;
    status: string;
  })[];
  spent: number;
  budget: number;
  remaining: number;
  percentage: number | null;
};
