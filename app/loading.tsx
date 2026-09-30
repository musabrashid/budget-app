export default function Loading() {
  return (
    <main className="loading-page" aria-label="Loading your budget">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-summary" />
      <div className="budget-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div className="skeleton skeleton-card" key={i} />
        ))}
      </div>
    </main>
  );
}
