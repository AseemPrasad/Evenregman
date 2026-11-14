import Link from "next/link";
import { getMeshOverview } from "@/lib/mesh/mesh-analytics";

export const dynamic = "force-dynamic";

export default async function MeshDashboardPage() {
  const { resources, activeLeases, metrics } = await getMeshOverview();

  return (
    <div className="space-y-8">
      {/* Hero Welcome */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Enterprise Resource Allocation Mesh
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Zero-overbooking compute scheduling with atomic expiring leases and automatic zombie reclamation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/mesh/resources"
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition shadow-lg shadow-cyan-500/20"
          >
            Deploy / Reserve Compute &rarr;
          </Link>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800/80 p-5 rounded-xl backdrop-blur-sm">
          <div className="text-xs font-mono uppercase text-slate-400 tracking-wider">Fleet Clusters</div>
          <div className="mt-2 text-3xl font-bold font-mono text-white">{metrics.totalResources}</div>
          <div className="text-xs text-slate-500 mt-1">Managed compute & test nodes</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800/80 p-5 rounded-xl backdrop-blur-sm">
          <div className="text-xs font-mono uppercase text-slate-400 tracking-wider">Mesh Utilization</div>
          <div className="mt-2 text-3xl font-bold font-mono text-cyan-400">{metrics.utilizationPercent}%</div>
          <div className="text-xs text-slate-500 mt-1">{metrics.occupiedSlots} of {metrics.totalSlots} slots active</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800/80 p-5 rounded-xl backdrop-blur-sm">
          <div className="text-xs font-mono uppercase text-slate-400 tracking-wider">Active Leases</div>
          <div className="mt-2 text-3xl font-bold font-mono text-emerald-400">{activeLeases.length}</div>
          <div className="text-xs text-slate-500 mt-1">Self-healing TTL enabled</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800/80 p-5 rounded-xl backdrop-blur-sm">
          <div className="text-xs font-mono uppercase text-slate-400 tracking-wider">Current Burn Rate</div>
          <div className="mt-2 text-3xl font-bold font-mono text-indigo-400">${metrics.activeBurnRate.toFixed(2)}/hr</div>
          <div className="text-xs text-slate-500 mt-1">Estimated active cloud spend</div>
        </div>
      </div>

      {/* Two-Column Section: Active Fleets & Recent Leases */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Resources & Fleets */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Managed Resource Pools</h2>
            <Link href="/mesh/resources" className="text-xs text-cyan-400 hover:underline">
              View all &rarr;
            </Link>
          </div>

          <div className="space-y-3">
            {resources.length === 0 ? (
              <div className="bg-slate-900/30 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm">
                No custom resources provisioned yet. Create one via <code className="text-cyan-400">/api/mesh/resources</code> or the portal.
              </div>
            ) : (
              resources.map((res) => {
                const available = res.capacity - res.attendeeCount;
                const isFull = available <= 0;

                return (
                  <div
                    key={res._id.toString()}
                    className="bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{res.title}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {res.resourceType ?? "RESOURCE"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{res.description}</p>
                      <div className="flex items-center gap-4 text-xs font-mono text-slate-500 mt-2">
                        <span>Rate: ${res.hourlyCostRate ?? 0}/hr</span>
                        <span>&bull;</span>
                        <span>Max Lease: {res.maxLeaseMinutes ?? 480}m</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className={`text-xs font-mono font-semibold ${isFull ? "text-amber-400" : "text-emerald-400"}`}>
                          {available} / {res.capacity} Free
                        </div>
                        <div className="text-[10px] text-slate-500">Atomic Redis Slots</div>
                      </div>

                      <Link
                        href={`/mesh/resources/${res.slug}`}
                        className={`text-xs px-3 py-2 rounded-lg font-semibold transition ${
                          isFull
                            ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                            : "bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        }`}
                      >
                        {isFull ? "Waitlist" : "Reserve Slot"}
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Leases Feed */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Live Leases</h2>
            <Link href="/mesh/leases" className="text-xs text-cyan-400 hover:underline">
              Manage &rarr;
            </Link>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
            {activeLeases.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Zero active leases. All compute instances are idle and preserved.
              </div>
            ) : (
              activeLeases.map((lease: any) => {
                const expiresAt = new Date(lease.leaseExpiresAt);
                const minsLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60)));

                return (
                  <div
                    key={lease._id.toString()}
                    className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-white truncate max-w-[160px]">{lease.eventId?.title ?? "Cluster"}</span>
                      <span className="font-mono text-cyan-400">{minsLeft}m left</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{lease.attendeeId?.name ?? "Developer"}</span>
                      <span className="font-mono text-emerald-400">ACTIVE</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

