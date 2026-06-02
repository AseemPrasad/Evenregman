export default function PublicEventLoading() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-border/70 bg-background/90 p-6 sm:p-8 lg:p-10">
        <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
        <div className="mt-6 h-12 w-3/4 animate-pulse rounded bg-muted/40" />
        <div className="mt-4 h-6 w-full animate-pulse rounded bg-muted/30" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
          ))}
        </div>
      </div>
    </main>
  );
}
