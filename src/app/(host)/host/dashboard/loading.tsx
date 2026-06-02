export default function HostDashboardLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
      <div className="mt-4 h-4 w-80 animate-pulse rounded bg-muted/40" />
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
        ))}
      </div>
      <div className="mt-8 h-96 animate-pulse rounded-3xl border border-border/70 bg-muted/30" />
    </main>
  );
}
