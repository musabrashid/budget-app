import "server-only";
import { NextResponse } from "next/server";
import { AccessError } from "@/lib/supabase/server";
import { ZodError } from "zod";
import { providerErrorCode } from "@/lib/plaid/paging";
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : new URL(request.url).origin;
  if (!origin || origin !== configuredOrigin) throw new AccessError();
}
export async function readJson(request: Request) {
  const raw = await request.text();
  if (raw.length > 32_000) throw new Error("Request is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new ZodError([]);
  }
}
class UserInputError extends Error {}
export function apiError(error: unknown) {
  if (error instanceof AccessError)
    return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof UserInputError)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: "Please check the form fields." },
      { status: 400 },
    );
  // Never log raw provider errors: they can contain request secrets and financial data.
  console.error("Budget operation failed", {
    kind: error instanceof Error ? error.name : "Unknown",
    providerCode: providerErrorCode(error),
  });
  return NextResponse.json(
    {
      error:
        "We could not complete that request. Please try again. If it keeps happening, check your connection settings.",
    },
    { status: 503 },
  );
}
export function checkResult(result: { error: unknown }) {
  if (result.error) {
    const code = (result.error as { code?: string }).code;
    if (code === "23505")
      throw new UserInputError(
        "A category or record with that name already exists. Choose another name.",
      );
    if (code === "23503")
      throw new UserInputError(
        "This record is still in use. Move its transactions or archive it.",
      );
    throw new Error("Database operation failed.");
  }
}
