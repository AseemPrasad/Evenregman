export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md space-y-3 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Access restricted
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Unauthorized</h1>
        <p className="text-sm text-muted-foreground">
          You do not have permission to access this area.
        </p>
      </div>
    </main>
  );
}