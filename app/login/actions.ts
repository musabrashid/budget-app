"use server";
import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { z } from "zod";
export async function signIn(form: FormData) {
  const input = z
    .object({ email: z.email(), password: z.string().min(1).max(200) })
    .safeParse(Object.fromEntries(form));
  if (!input.success) redirect("/login?error=invalid");
  const allowed = process.env.ALLOWED_USER_EMAIL?.trim().toLowerCase();
  if (!allowed || input.data.email.toLowerCase() !== allowed)
    redirect("/login?error=invalid");
  const db = await userClient();
  const { error } = await db.auth.signInWithPassword(input.data);
  if (error) redirect("/login?error=invalid");
  redirect("/");
}
export async function signOut() {
  const db = await userClient();
  await db.auth.signOut();
  redirect("/login");
}
