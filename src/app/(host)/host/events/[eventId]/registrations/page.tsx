import { auth } from "@/lib/session";
import { canAccessHostRoute } from "@/lib/permissions";
import { getEventRegistrationsForHost } from "@/lib/registrations-admin";
import { redirect } from "next/navigation";
import RegistrationTable from "@/components/registrations/registration-table";

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ params, searchParams }: Props) {
  const session = await auth();

  if (!session?.user || !canAccessHostRoute(session.user.role)) {
    redirect("/signin");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const page = Number((resolvedSearchParams?.page as string) || 1);
  const limit = Number((resolvedSearchParams?.limit as string) || 20);
  const search =
    typeof resolvedSearchParams?.search === "string" ? (resolvedSearchParams.search as string) : undefined;
  const sort = typeof resolvedSearchParams?.sort === "string" ? (resolvedSearchParams.sort as any) : undefined;

  // server-side fetch initial page for faster first paint & ownership assert
  const { eventId } = await params;

  const initial = await getEventRegistrationsForHost(eventId, session.user.id, {
    page,
    limit,
    search,
    sort
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Registrations</h1>
        <p className="text-sm text-muted-foreground">View attendee registrations for this event.</p>
      </div>

      <RegistrationTable eventId={eventId} initialData={initial} />
    </main>
  );
}
