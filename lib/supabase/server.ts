import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
export async function userClient() {
  if (!configured()) throw new Error("Supabase is not configured.");
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Proxy handles refresh in server components. */
          }
        },
      },
    },
  );
}
export function adminClient() {
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !configured())
    throw new Error("Server database credentials are not configured.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function requireUser() {
  const db = await userClient();
  const { data, error } = await db.auth.getUser();
  const allowed = process.env.ALLOWED_USER_EMAIL?.trim().toLowerCase();
  if (
    error ||
    !data.user ||
    !allowed ||
    data.user.email?.toLowerCase() !== allowed
  )
    throw new AccessError();
  return { db, user: data.user };
}
export class AccessError extends Error {
  constructor() {
    super("Please sign in to your private account.");
  }
}
