import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <div className="card">
        <h1>This page took a wrong turn.</h1>
        <Link className="button primary" href="/">
          Back to your budget
        </Link>
      </div>
    </main>
  );
}
