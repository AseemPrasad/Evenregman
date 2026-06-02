export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-xl space-y-4 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Scaffold initialized
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Event Registration & Management System
        </h1>
        <p className="text-base text-muted-foreground">
          The Next.js 15, TypeScript, Tailwind v4, and shadcn/ui foundation is now in place.
        </p>
      </div>
    </main>
  );
}