import { NextResponse } from "next/server";
import { z } from "zod";
import { CountryCode } from "plaid";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { apiError, readJson, sameOrigin, checkResult } from "@/lib/api";
import { plaidClient } from "@/lib/plaid/client";
import { encryptToken } from "@/lib/plaid/crypto";
import { persistAccounts, syncItem } from "@/lib/plaid/sync";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await requireUser();
    const input = z
      .object({ public_token: z.string().min(10).max(2000) })
      .parse(await readJson(request));
    const plaid = plaidClient();
    const result = await plaid.itemPublicTokenExchange({
      public_token: input.public_token,
    });
    const { access_token, item_id } = result.data;
    const detail = await plaid.itemGet({ access_token });
    const institutionId = detail.data.item.institution_id;
    const institution = institutionId
      ? (
          await plaid.institutionsGetById({
            institution_id: institutionId,
            country_codes: [CountryCode.Us],
          })
        ).data.institution
      : null;
    const db = adminClient();
    const row = await db
      .from("institutions")
      .upsert(
        {
          user_id: user.id,
          plaid_item_id: item_id,
          plaid_institution_id: institutionId,
          name: institution?.name ?? "Connected institution",
        },
        { onConflict: "plaid_item_id" },
      )
      .select("id")
      .single();
    checkResult(row);
    // Store credentials before the first sync so an initial-history delay is recoverable.
    checkResult(
      await db
        .from("plaid_tokens")
        .upsert(
          {
            institution_id: row.data!.id,
            user_id: user.id,
            encrypted_access_token: encryptToken(access_token, user.id),
          },
          { onConflict: "institution_id" },
        ),
    );
    const accounts = await plaid.accountsGet({ access_token });
    await persistAccounts(user.id, row.data!.id, accounts.data.accounts);
    try {
      await syncItem(row.data!.id, user.id);
    } catch {
      return NextResponse.json({ connected: true, syncPending: true });
    }
    return NextResponse.json({ connected: true, syncPending: false });
  } catch (e) {
    return apiError(e);
  }
}
