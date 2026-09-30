import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { loadData } from "@/lib/data";
import { apiError, checkResult, readJson, sameOrigin } from "@/lib/api";
import { slugify } from "@/lib/categories/defaults";
import { schema } from "@/lib/mutations";
export async function GET() {
  try {
    return NextResponse.json(await loadData(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = schema.parse(await readJson(request));
    const { db, user } = await requireUser();
    switch (input.op) {
      case "category": {
        const { op: _, id: categoryId, ...fields } = input;
        void _;
        const row = { ...fields, slug: slugify(fields.name) };
        if (!row.slug) throw new z.ZodError([]);
        checkResult(
          categoryId
            ? await db
                .from("categories")
                .update(row)
                .eq("id", categoryId)
                .eq("user_id", user.id)
            : await db
                .from("categories")
                .insert({
                  ...row,
                  user_id: user.id,
                  is_default: false,
                  sort_order: 100,
                }),
        );
        break;
      }
      case "archive":
        checkResult(
          await db
            .from("categories")
            .update({ active: input.active })
            .eq("id", input.id),
        );
        break;
      case "delete_category":
        checkResult(
          await db.rpc("delete_custom_category", {
            category: input.id,
            replacement: input.target,
          }),
        );
        break;
      case "reorder":
        checkResult(
          await db.rpc("reorder_categories", { ordered_ids: input.ids }),
        );
        break;
      case "budget":
        checkResult(
          await db
            .from("budgets")
            .upsert(
              {
                user_id: user.id,
                category_id: input.category_id,
                month: input.month,
                limit_amount: input.limit_amount,
              },
              { onConflict: "user_id,category_id,month" },
            ),
        );
        break;
      case "transaction":
        checkResult(
          await db
            .from("transactions")
            .update({
              user_category_id: input.user_category_id,
              budget_override: input.budget_override,
              notes: input.notes,
            })
            .eq("id", input.id),
        );
        break;
      case "account":
        checkResult(
          await db
            .from("accounts")
            .update({ include_in_budget: input.include_in_budget })
            .eq("id", input.id),
        );
        break;
      case "rule": {
        const { op: _, id: ruleId, ...fields } = input;
        void _;
        checkResult(
          ruleId
            ? await db
                .from("transaction_category_rules")
                .update(fields)
                .eq("id", ruleId)
            : await db
                .from("transaction_category_rules")
                .insert({ ...fields, user_id: user.id }),
        );
        break;
      }
      case "delete_rule":
        checkResult(
          await db
            .from("transaction_category_rules")
            .delete()
            .eq("id", input.id),
        );
        break;
      case "preferences": {
        const { op: _, ...fields } = input;
        void _;
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: fields.timezone });
        } catch {
          throw new z.ZodError([]);
        }
        checkResult(
          await db
            .from("user_preferences")
            .update(fields)
            .eq("user_id", user.id),
        );
        break;
      }
    }
    return NextResponse.json(await loadData(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
