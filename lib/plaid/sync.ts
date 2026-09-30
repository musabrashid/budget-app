import "server-only";
import { randomUUID } from "node:crypto";
import type { AccountBase, Transaction as PlaidTransaction } from "plaid";
import { adminClient } from "@/lib/supabase/server";
import { plaidClient } from "./client";
import { decryptToken } from "./crypto";
import { collectSync } from "./paging";
import { checkResult } from "@/lib/api";
export async function persistAccounts(
  owner: string,
  item: string,
  accounts: AccountBase[],
) {
  const db = adminClient();
  // Don't overwrite a user's inclusion preference during refresh.
  for (const a of accounts) {
    const existing = await db
      .from("accounts")
      .select("id")
      .eq("user_id", owner)
      .eq("plaid_account_id", a.account_id)
      .maybeSingle();
    checkResult(existing);
    const row = {
      user_id: owner,
      institution_id: item,
      plaid_account_id: a.account_id,
      name: a.name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      current_balance: a.balances.current,
      available_balance: a.balances.available,
      currency:
        a.balances.iso_currency_code ??
        a.balances.unofficial_currency_code ??
        "USD",
    };
    checkResult(
      existing.data
        ? await db.from("accounts").update(row).eq("id", existing.data.id)
        : await db
            .from("accounts")
            .insert({
              ...row,
              include_in_budget:
                a.type === "credit" ||
                (a.type === "depository" && a.subtype === "checking"),
            }),
    );
  }
}
export async function syncItem(item: string, owner?: string) {
  const db = adminClient();
  const tokenResult = await db
    .from("plaid_tokens")
    .select("*")
    .eq("institution_id", item)
    .maybeSingle();
  checkResult(tokenResult);
  const token = tokenResult.data;
  if (!token || (owner && token.user_id !== owner))
    throw new Error("Bank connection not found.");
  const lease = randomUUID();
  const claim = await db.rpc("claim_sync", { item, lease });
  checkResult(claim);
  if (!claim.data) return { busy: true };
  try {
    const access_token = decryptToken(
      token.encrypted_access_token,
      token.user_id,
    );
    const plaid = plaidClient();
    const accounts = await plaid.accountsGet({ access_token });
    await persistAccounts(token.user_id, item, accounts.data.accounts);
    const mapping = await db
      .from("accounts")
      .select("id,plaid_account_id")
      .eq("institution_id", item)
      .eq("user_id", token.user_id);
    checkResult(mapping);
    const result = await collectSync<PlaidTransaction>(
      token.cursor,
      async (cursor) =>
        (await plaid.transactionsSync({ access_token, cursor, count: 500 }))
          .data,
    );
    const changed = result.changed.map((t) => {
      const account = mapping.data!.find(
        (a) => a.plaid_account_id === t.account_id,
      );
      if (!account) throw new Error("Account mapping unavailable.");
      const primary = t.personal_finance_category?.primary ?? null;
      const detailed = t.personal_finance_category?.detailed ?? null;
      const transfer =
        ["TRANSFER_IN", "TRANSFER_OUT"].includes(primary ?? "") ||
        detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
      return {
        plaid_transaction_id: t.transaction_id,
        pending_transaction_id: t.pending_transaction_id,
        account_id: account.id,
        merchant_name: t.merchant_name,
        original_name: t.name,
        amount: t.amount,
        currency: t.iso_currency_code ?? t.unofficial_currency_code ?? "USD",
        transaction_date: t.date,
        authorized_date: t.authorized_date,
        pending: t.pending,
        plaid_primary_category: primary,
        plaid_detailed_category: detailed,
        transaction_type: transfer
          ? "transfer"
          : primary === "INCOME"
            ? "income"
            : t.amount < 0
              ? "refund"
              : "purchase",
      };
    });
    checkResult(
      await db.rpc("apply_sync_batch", {
        item,
        lease,
        next_cursor: result.cursor,
        changed,
        removed_ids: result.removed,
      }),
    );
    return { busy: false, updated: changed.length };
  } catch (error) {
    const code = (error as { response?: { data?: { error_code?: string } } })
      .response?.data?.error_code;
    await db
      .from("institutions")
      .update({
        status:
          code === "ITEM_LOGIN_REQUIRED" ? "reconnect_required" : "sync_error",
      })
      .eq("id", item);
    throw error;
  } finally {
    await db
      .from("plaid_tokens")
      .update({ lease_id: null, lease_until: null })
      .eq("institution_id", item)
      .eq("lease_id", lease);
  }
}
