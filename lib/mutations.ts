import { z } from "zod";
const id = z.string().uuid();
const amount = z.number().finite().min(0).max(1000000).multipleOf(0.01);
const categoryFields = {
  name: z.string().trim().min(1).max(60),
  icon: z.enum([
    "home",
    "basket",
    "coffee",
    "car",
    "bag",
    "play",
    "plane",
    "heart",
    "zap",
    "wrench",
    "gift",
    "wallet",
    "book",
    "users",
    "paw",
    "dots",
  ]),
  monthly_budget: amount,
  parent_category_id: id.nullable(),
};
export const schema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("category"), id: id.optional(), ...categoryFields }),
  z.object({ op: z.literal("archive"), id, active: z.boolean() }),
  z.object({ op: z.literal("delete_category"), id, target: id }),
  z.object({ op: z.literal("reorder"), ids: z.array(id).max(100) }),
  z.object({
    op: z.literal("budget"),
    category_id: id,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
    limit_amount: amount,
  }),
  z.object({
    op: z.literal("transaction"),
    id,
    user_category_id: id.nullable(),
    budget_override: z.boolean().nullable(),
    notes: z.string().max(2000),
  }),
  z.object({ op: z.literal("account"), id, include_in_budget: z.boolean() }),
  z.object({
    op: z.literal("rule"),
    id: id.optional(),
    rule_type: z.enum([
      "merchant_contains",
      "merchant_equals",
      "description_contains",
    ]),
    match_value: z.string().trim().min(1).max(200),
    category_id: id,
    priority: z.number().int().min(0).max(10000),
    active: z.boolean(),
    exclude_from_budget: z.boolean(),
  }),
  z.object({ op: z.literal("delete_rule"), id }),
  z.object({
    op: z.literal("preferences"),
    include_pending: z.boolean(),
    theme: z.enum(["light", "dark", "system"]),
    default_month: z.enum(["current", "last"]),
    timezone: z.string().max(100),
    onboarding_complete: z.boolean(),
  }),
]);
export type Mutation = z.infer<typeof schema>;
