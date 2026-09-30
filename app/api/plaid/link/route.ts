import { NextResponse } from "next/server";
import { Products, CountryCode } from "plaid";
import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { apiError, readJson, sameOrigin, checkResult } from "@/lib/api";
import { plaidClient } from "@/lib/plaid/client";
import { decryptToken } from "@/lib/plaid/crypto";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await requireUser();
    const input = z
      .object({ institution_id: z.string().uuid().optional() })
      .parse(await readJson(request));
    let access_token: string | undefined;
    if (input.institution_id) {
      const r = await adminClient()
        .from("plaid_tokens")
        .select("encrypted_access_token")
        .eq("user_id", user.id)
        .eq("institution_id", input.institution_id)
        .single();
      checkResult(r);
      access_token = decryptToken(r.data!.encrypted_access_token, user.id);
    }
    const response = await plaidClient().linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "Still Budget",
      country_codes: [CountryCode.Us],
      language: "en",
      ...(access_token
        ? { access_token }
        : {
            products: [Products.Transactions],
            transactions: { days_requested: 365 },
          }),
      ...(process.env.PLAID_WEBHOOK_URL
        ? { webhook: process.env.PLAID_WEBHOOK_URL }
        : {}),
    });
    return NextResponse.json({ link_token: response.data.link_token });
  } catch (e) {
    return apiError(e);
  }
}
