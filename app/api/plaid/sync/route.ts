import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { syncItem } from "@/lib/plaid/sync";
import { apiError, sameOrigin, checkResult } from "@/lib/api";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await requireUser();
    const items = await db.from("institutions").select("id");
    checkResult(items);
    const results = await Promise.allSettled(
      items.data!.map((item) => syncItem(item.id, user.id)),
    );
    return NextResponse.json({
      synced: results.filter((r) => r.status === "fulfilled" && !r.value.busy)
        .length,
      busy: results.filter((r) => r.status === "fulfilled" && r.value.busy)
        .length,
      failed: results.filter((r) => r.status === "rejected").length,
    });
  } catch (e) {
    return apiError(e);
  }
}
