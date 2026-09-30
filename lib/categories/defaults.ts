export const DEFAULT_CATEGORIES = [
  ["Housing", "home", 2100],
  ["Groceries", "basket", 500],
  ["Dining & Drinks", "coffee", 700],
  ["Transportation", "car", 500],
  ["Shopping", "bag", 300],
  ["Entertainment", "play", 400],
  ["Travel", "plane", 200],
  ["Health & Wellness", "heart", 600],
  ["Bills & Utilities", "zap", 250],
  ["Services", "wrench", 50],
  ["Gifts & Donations", "gift", 150],
  ["Financial", "wallet", 100],
  ["Education", "book", 50],
  ["Family & Kids", "users", 50],
  ["Pets", "paw", 50],
  ["Other", "dots", 0],
] as const;
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const PLAID_CATEGORY_MAP: Record<string, string> = {
  RENT_AND_UTILITIES: "Bills & Utilities",
  FOOD_AND_DRINK: "Dining & Drinks",
  TRANSPORTATION: "Transportation",
  GENERAL_MERCHANDISE: "Shopping",
  ENTERTAINMENT: "Entertainment",
  TRAVEL: "Travel",
  MEDICAL: "Health & Wellness",
  PERSONAL_CARE: "Health & Wellness",
  GENERAL_SERVICES: "Services",
  GOVERNMENT_AND_NON_PROFIT: "Gifts & Donations",
  BANK_FEES: "Financial",
  LOAN_PAYMENTS: "Financial",
  HOME_IMPROVEMENT: "Housing",
};
