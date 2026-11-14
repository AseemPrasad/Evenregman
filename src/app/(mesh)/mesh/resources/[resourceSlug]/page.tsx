import "server-only";

import { notFound } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { EventModel } from "@/models/Event";
import { LeaseBookingForm } from "./lease-form";

export const dynamic = "force-dynamic";

export default async function ResourceDetailsPage({
  params
}: {
  params: Promise<{ resourceSlug: string }>;
}) {
  const { resourceSlug } = await params;
  await connectToDatabase();

  const resource = await EventModel.findOne({
    slug: resourceSlug.trim().toLowerCase(),
    kind: "RESOURCE",
    status: { $ne: "DELETED" }
  }).lean();

  if (!resource) {
    notFound();
  }

  const availableSlots = resource.capacity - resource.attendeeCount;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
            {resource.resourceType ?? "COMPUTE"}
          </span>
          <span className="text-xs font-mono text-emerald-400">
            {availableSlots} of {resource.capacity} slots available
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-white mt-3 tracking-tight">{resource.title}</h1>
        <p className="text-slate-400 text-sm mt-2 leading-relaxed">{resource.description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">Cluster Specifications & Guardrails</h3>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-500">Hourly Rate</span>
                <p className="text-slate-200 text-sm mt-1 font-bold">${resource.hourlyCostRate ?? 0}/hr</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-500">Max Concurrency</span>
                <p className="text-slate-200 text-sm mt-1 font-bold">{resource.capacity} Tenants</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-500">Default Duration</span>
                <p className="text-slate-200 text-sm mt-1 font-bold">{resource.defaultLeaseMinutes ?? 120} mins</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-500">Max Allowed Lease</span>
                <p className="text-slate-200 text-sm mt-1 font-bold">{resource.maxLeaseMinutes ?? 480} mins</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <LeaseBookingForm
            resourceSlug={resource.slug}
            defaultDuration={resource.defaultLeaseMinutes ?? 120}
            maxDuration={resource.maxLeaseMinutes ?? 480}
          />
        </div>
      </div>
    </div>
  );
}

