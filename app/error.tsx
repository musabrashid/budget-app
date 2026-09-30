"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <div className="card">
        <h1>A moment to reconnect.</h1>
        <p>
          We couldn’t load your budget. Your saved data is safe. Check your
          connection and try again.
        </p>
        <button className="button primary" onClick={reset}>
          Try again
        </button>
        <Link className="button secondary" href="/login">
          Return to sign-in
        </Link>
      </div>
    </main>
  );
}
