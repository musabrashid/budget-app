import type { AppData } from "@/types";
import type { Mutation } from "./mutations";
import { slugify } from "./categories/defaults";
export function mutateDemo(previous: AppData, input: Mutation): AppData {
  const d = structuredClone(previous);
  const uid = () => crypto.randomUUID();
  switch (input.op) {
    case "category": {
      const { op: _, id, ...fields } = input;
      void _;
      const slug = slugify(fields.name);
      if (d.categories.some((c) => c.slug === slug && c.id !== id))
        throw new Error("A category with that name already exists.");
      if (id)
        d.categories = d.categories.map((c) =>
          c.id === id ? { ...c, ...fields, slug } : c,
        );
      else
        d.categories.push({
          ...fields,
          id: uid(),
          slug,
          is_default: false,
          default_key: null,
          active: true,
          sort_order: 100,
        });
      break;
    }
    case "archive":
      d.categories = d.categories.map((c) =>
        c.id === input.id ? { ...c, active: input.active } : c,
      );
      break;
    case "delete_category":
      if (d.categories.find((c) => c.id === input.id)?.is_default)
        throw new Error("Default categories can be archived.");
      d.transactions = d.transactions.map((t) => ({
        ...t,
        category_id: t.category_id === input.id ? input.target : t.category_id,
        user_category_id:
          t.user_category_id === input.id ? input.target : t.user_category_id,
      }));
      d.rules = d.rules.map((r) =>
        r.category_id === input.id ? { ...r, category_id: input.target } : r,
      );
      d.budgets = d.budgets.filter((b) => b.category_id !== input.id);
      d.categories = d.categories
        .filter((c) => c.id !== input.id)
        .map((c) =>
          c.parent_category_id === input.id
            ? { ...c, parent_category_id: null }
            : c,
        );
      break;
    case "reorder":
      d.categories = d.categories.map((c) => ({
        ...c,
        sort_order: input.ids.indexOf(c.id),
      }));
      break;
    case "budget": {
      const index = d.budgets.findIndex(
        (b) => b.category_id === input.category_id && b.month === input.month,
      );
      const b = {
        id: index >= 0 ? d.budgets[index].id : uid(),
        category_id: input.category_id,
        month: input.month,
        limit_amount: input.limit_amount,
        rollover_enabled: false,
      };
      if (index >= 0) d.budgets[index] = b;
      else d.budgets.push(b);
      break;
    }
    case "transaction":
      d.transactions = d.transactions.map((t) =>
        t.id === input.id
          ? {
              ...t,
              user_category_id: input.user_category_id,
              budget_override: input.budget_override,
              notes: input.notes,
            }
          : t,
      );
      break;
    case "account":
      d.accounts = d.accounts.map((a) =>
        a.id === input.id
          ? { ...a, include_in_budget: input.include_in_budget }
          : a,
      );
      break;
    case "rule": {
      const { op: _, id, ...fields } = input;
      void _;
      if (id)
        d.rules = d.rules.map((r) => (r.id === id ? { ...r, ...fields } : r));
      else d.rules.push({ ...fields, id: uid() });
      break;
    }
    case "delete_rule":
      d.rules = d.rules.filter((r) => r.id !== input.id);
      break;
    case "preferences": {
      const { op: _, ...fields } = input;
      void _;
      d.preferences = fields;
      break;
    }
  }
  return d;
}
