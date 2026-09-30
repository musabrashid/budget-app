import Link from "next/link";
import { Wallet, ArrowUpRight, ShieldCheck } from "lucide-react";
import { signIn } from "./actions";
import { configured } from "@/lib/supabase/server";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ready = configured() && Boolean(process.env.ALLOWED_USER_EMAIL);
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand">
          <span className="brand-symbol">
            <Wallet size={22} />
          </span>
          still<span className="brand-dot">.</span>
        </div>
        <div className="eyebrow">A LITTLE CLARITY, EVERY DAY</div>
        <h1>
          Make room for
          <br />
          what matters.
        </h1>
        <p>
          A calm place for your money. Your budget, your banks, your decisions.
        </p>
        {ready ? (
          <form action={signIn}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p role="alert" className="error-text">
                Unable to sign in. Check your credentials and try again.
              </p>
            )}
            <button className="button primary" type="submit">
              Sign in <ArrowUpRight size={18} />
            </button>
            <p className="small muted">
              Use the private account created in Supabase. Contact your app
              administrator for password recovery.
            </p>
          </form>
        ) : (
          <div className="callout">
            Your private workspace is almost ready. Configure Supabase and your
            allowed email to enable sign-in.
          </div>
        )}
        <Link className="button secondary" href="/demo">
          Explore the demo <ArrowUpRight size={18} />
        </Link>
        <div className="privacy-note">
          <ShieldCheck size={16} /> Private by design. No ads. No trackers.
        </div>
      </section>
      <div className="login-art" aria-hidden="true">
        <div className="art-orbit">
          <Wallet size={70} />
        </div>
        <p>
          Less guesswork.
          <br />
          More breathing room.
        </p>
      </div>
    </main>
  );
}
