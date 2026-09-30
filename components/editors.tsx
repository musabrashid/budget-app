"use client";
import { useState } from "react";
import type { AppData, Category, Rule, Transaction } from "@/types";
import type { Mutation } from "@/lib/mutations";
import { categorizeTransaction } from "@/lib/budget/logic";
import { iconNames, CategoryIcon } from "./icons";
export type Save = (input: Mutation) => Promise<boolean>;
export function CategoryEditor({
  data,
  category,
  save,
  close,
}: {
  data: AppData;
  category?: Category;
  save: Save;
  close: () => void;
}) {
  const [icon, setIcon] = useState(category?.icon ?? "coffee");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await save({
            op: "category",
            id: category?.id,
            name: String(f.get("name")),
            icon: icon as Extract<Mutation, { op: "category" }>["icon"],
            monthly_budget: Number(f.get("budget")),
            parent_category_id: String(f.get("parent")) || null,
          })
        )
          close();
      }}
      className="form-stack"
    >
      <label>
        Name
        <input
          name="name"
          defaultValue={category?.name}
          placeholder="e.g. Coffee"
          maxLength={60}
          required
        />
      </label>
      <fieldset>
        <legend>Icon</legend>
        <div className="icon-picker">
          {iconNames.map((i) => (
            <button
              type="button"
              key={i}
              aria-label={i}
              aria-pressed={icon === i}
              className={icon === i ? "selected" : ""}
              onClick={() => setIcon(i)}
            >
              <CategoryIcon name={i} />
            </button>
          ))}
        </div>
      </fieldset>
      <label>
        Recurring monthly budget ($)
        <input
          name="budget"
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          defaultValue={category?.monthly_budget ?? 0}
          required
        />
      </label>
      <label>
        Parent category (optional)
        <select name="parent" defaultValue={category?.parent_category_id ?? ""}>
          <option value="">None</option>
          {data.categories
            .filter(
              (c) =>
                c.id !== category?.id && c.is_default && !c.parent_category_id,
            )
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <p className="small muted">
        Recurring limits apply to every month unless you set a monthly override.
        Categories group transactions; parent categories do not add their totals
        a second time.
      </p>
      <button className="button primary" type="submit">
        Save category
      </button>
    </form>
  );
}
export function BudgetEditor({
  category,
  month,
  budget,
  save,
  close,
}: {
  category: Category;
  month: string;
  budget: number;
  save: Save;
  close: () => void;
}) {
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const scope = f.get("scope");
        if (
          await save(
            scope === "monthly"
              ? {
                  op: "budget",
                  category_id: category.id,
                  month: `${month}-01`,
                  limit_amount: Number(f.get("amount")),
                }
              : {
                  op: "category",
                  id: category.id,
                  name: category.name,
                  icon: category.icon as Extract<
                    Mutation,
                    { op: "category" }
                  >["icon"],
                  monthly_budget: Number(f.get("amount")),
                  parent_category_id: category.parent_category_id,
                },
          )
        )
          close();
      }}
    >
      <label>
        Budget amount ($)
        <input
          name="amount"
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          defaultValue={budget}
          required
          autoFocus
        />
      </label>
      <label>
        Apply to
        <select name="scope">
          <option value="monthly">This month ({month})</option>
          <option value="recurring">Recurring monthly default</option>
        </select>
      </label>
      <button className="button primary">Save budget</button>
    </form>
  );
}
export function TransactionEditor({
  data,
  t,
  save,
  close,
  makeRule,
}: {
  data: AppData;
  t: Transaction;
  save: Save;
  close: () => void;
  makeRule: (t: Transaction) => void;
}) {
  const account = data.accounts.find((a) => a.id === t.account_id);
  const institution = data.institutions.find((i) => i.id === t.institution_id);
  return (
    <>
      <div className="transaction-hero">
        <p className="eyebrow">
          {t.pending ? "PENDING TRANSACTION" : "POSTED TRANSACTION"}
        </p>
        <h3>{t.merchant_name ?? t.original_name}</h3>
        <strong>
          {new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: t.currency,
          }).format(t.amount)}
        </strong>
        <p>
          {t.transaction_type === "refund"
            ? "Refund reduces spending"
            : t.transaction_type === "transfer"
              ? "Transfer · excluded by default"
              : t.transaction_type === "income"
                ? "Income · excluded by default"
                : "Purchase"}
        </p>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Date</dt>
          <dd>{t.transaction_date}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>
            {account?.name} · {account?.mask}
          </dd>
        </div>
        <div>
          <dt>Institution</dt>
          <dd>{institution?.name}</dd>
        </div>
        <div>
          <dt>Original description</dt>
          <dd>{t.original_name}</dd>
        </div>
        <div>
          <dt>Plaid category</dt>
          <dd>
            {t.plaid_detailed_category?.replaceAll("_", " ").toLowerCase() ??
              "Not provided"}
          </dd>
        </div>
      </dl>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const inclusion = String(f.get("inclusion"));
          if (
            await save({
              op: "transaction",
              id: t.id,
              user_category_id: String(f.get("category")) || null,
              budget_override:
                inclusion === "auto" ? null : inclusion === "include",
              notes: String(f.get("notes")),
            })
          )
            close();
        }}
      >
        <label>
          Category
          <select
            aria-label="Category"
            name="category"
            defaultValue={t.user_category_id ?? ""}
          >
            <option value="">
              Automatic ·{" "}
              {
                data.categories.find(
                  (c) =>
                    c.id ===
                    categorizeTransaction(t, data.rules, data.categories),
                )?.name
              }
            </option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!c.active ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Budget treatment
          <select
            name="inclusion"
            defaultValue={
              t.budget_override === null
                ? "auto"
                : t.budget_override
                  ? "include"
                  : "exclude"
            }
          >
            <option value="auto">Automatic</option>
            <option value="include">Include (override classification)</option>
            <option value="exclude">Exclude from budget</option>
          </select>
        </label>
        <p className="small muted">
          Account exclusion and the pending preference always apply. Manual
          inclusion can count a transfer; use it carefully.
        </p>
        <label>
          Notes
          <textarea
            name="notes"
            defaultValue={t.notes}
            maxLength={2000}
            rows={3}
          />
        </label>
        <button className="button primary">Save transaction</button>
        <button
          type="button"
          className="button secondary"
          onClick={() => makeRule(t)}
        >
          Create a categorization rule
        </button>
      </form>
    </>
  );
}
export function RuleEditor({
  data,
  rule,
  transaction,
  save,
  close,
}: {
  data: AppData;
  rule?: Rule;
  transaction?: Transaction;
  save: Save;
  close: () => void;
}) {
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await save({
            op: "rule",
            id: rule?.id,
            rule_type: String(f.get("type")) as Rule["rule_type"],
            match_value: String(f.get("match")),
            category_id: String(f.get("category")),
            priority: Number(f.get("priority")),
            active: f.get("active") === "on",
            exclude_from_budget: f.get("exclude") === "on",
          })
        )
          close();
      }}
    >
      <label>
        Match
        <select
          name="type"
          defaultValue={rule?.rule_type ?? "merchant_contains"}
        >
          <option value="merchant_contains">Merchant contains</option>
          <option value="merchant_equals">Merchant equals</option>
          <option value="description_contains">Description contains</option>
        </select>
      </label>
      <label>
        Text to match
        <input
          name="match"
          maxLength={200}
          required
          defaultValue={
            rule?.match_value ??
            transaction?.merchant_name ??
            transaction?.original_name ??
            ""
          }
          placeholder="STARBUCKS"
        />
      </label>
      <label>
        Category
        <select
          aria-label="Category"
          name="category"
          defaultValue={
            rule?.category_id ??
            (transaction
              ? (categorizeTransaction(
                  transaction,
                  data.rules,
                  data.categories,
                ) ?? "")
              : "")
          }
          required
        >
          <option value="" disabled>
            Choose a category
          </option>
          {data.categories
            .filter((c) => c.active)
            .map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Priority (lower number wins)
        <input
          name="priority"
          type="number"
          min="0"
          max="10000"
          defaultValue={rule?.priority ?? 100}
          required
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="active"
          defaultChecked={rule?.active ?? true}
        />{" "}
        Rule enabled
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="exclude"
          defaultChecked={rule?.exclude_from_budget ?? false}
        />{" "}
        Exclude matching transactions from spending
      </label>
      <p className="small muted">
        Rules apply to current and future transactions. Your manual category
        choices take priority.
      </p>
      <button className="button primary">Save rule</button>
    </form>
  );
}
