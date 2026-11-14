import "server-only";

import { connectToDatabase } from "@/lib/db";
import { RegistrationModel } from "@/models/Registration";
import { LeaseControls } from "./lease-controls";

export const dynamic = "force-dynamic";

export default async function ActiveLeasesPage() {
  await connectToDatabase();

  const now = new Date();
  const leases = await RegistrationModel.find({
    kind: "LEASE"
  })
    .populate("eventId", "title slug resourceType hourlyCostRate")
    .populate("attendeeId", "name email")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Active & Historical Leases</h1>
        <p className="text-slate-400 text-sm mt-1">
          Monitor leased compute reservations, active token holders, and self-reclaimed allocations.
        </p>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        {leases.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No leases recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Resource Cluster</th>
                  <th className="py-3 px-4">Holder</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Lease Window</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {leases.map((lease: any) => {
                  const isLive = lease.status === "ACTIVE" && new Date(lease.leaseExpiresAt) > now;
                  const minsLeft = isLive
                    ? Math.max(0, Math.round((new Date(lease.leaseExpiresAt).getTime() - now.getTime()) / (1000 * 60)))
                    : 0;

                  return (
                    <tr key={lease._id.toString()} className="hover:bg-slate-900/60 transition">
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {lease.eventId?.title ?? "Unknown Cluster"}
                        <span className="block text-[10px] text-slate-500 font-mono">
                          {lease.eventId?.resourceType ?? "RESOURCE"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {lease.attendeeId?.name ?? "Developer"}
                        <span className="block text-[10px] text-slate-500 font-mono truncate max-w-[150px]">
                          {lease.attendeeId?.email}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            isLive
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : lease.status === "EXPIRED"
                              ? "bg-slate-800 text-slate-400"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {isLive ? `ACTIVE (${minsLeft}m left)` : lease.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {lease.leaseExpiresAt ? new Date(lease.leaseExpiresAt).toLocaleTimeString() : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isLive && (
                          <LeaseControls
                            leaseId={lease._id.toString()}
                            initialMinutesLeft={minsLeft}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

