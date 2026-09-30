import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyWebhook } from "@/lib/plaid/webhook";
import { adminClient } from "@/lib/supabase/server";
import { syncItem } from "@/lib/plaid/sync";
export const maxDuration = 300;
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 100000) return new NextResponse(null, { status: 413 });
  try {
    await verifyWebhook(raw, request.headers.get("plaid-verification") ?? "");
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  const parsed = z
    .object({
      item_id: z.string(),
      webhook_type: z.string(),
      webhook_code: z.string(),
    })
    .safeParse(JSON.parse(raw));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const event = parsed.data;
  const db = adminClient();
  const result = await db
    .from("institutions")
    .select("id")
    .eq("plaid_item_id", event.item_id)
    .maybeSingle();
  if (result.error) return new NextResponse(null, { status: 503 });
  if (!result.data) return NextResponse.json({ received: true });
  if (event.webhook_type === "ITEM" && event.webhook_code === "ERROR")
    await db
      .from("institutions")
      .update({ status: "reconnect_required" })
      .eq("id", result.data.id);
  if (
    event.webhook_type === "TRANSACTIONS" &&
    event.webhook_code === "SYNC_UPDATES_AVAILABLE"
  ) {
    try {
      const resultSync = await syncItem(result.data.id);
      if (resultSync.busy) return new NextResponse(null, { status: 503 });
    } catch {
      return new NextResponse(null, { status: 503 });
    }
  }
  return NextResponse.json({ received: true });
}
