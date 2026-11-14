import "server-only";

import { connectToDatabase } from "@/lib/db";
import { EventModel } from "@/models/Event";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ResourcesCatalogPage() {
  await connectToDatabase();

  const resources = await EventModel.find({
    kind: "RESOURCE",
    status: { $ne: "DELETED" }
  }).lean();

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Scarce Compute & Fleets</h1>
        <p className="text-slate-400 text-sm mt-1">
          Catalog of high-performance GPU nodes, ephemeral preview stacks, and sandbox environments.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {resources.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 text-sm bg-slate-900/20 border border-dashed border-slate-800 rounded-xl">
            No fleets listed yet. Use the API or admin portal to provision resources.
          </div>
        ) : (
          resources.map((res) => {
            const available = res.capacity - res.attendeeCount;
            const isFull = available <= 0;

            return (
              <div
                key={res._id.toString()}
                className="bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-xl p-6 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/80 font-semibold">
                      {res.resourceType ?? "COMPUTE"}
                    </span>
                    <span className={`text-xs font-mono font-semibold ${isFull ? "text-amber-400" : "text-emerald-400"}`}>
                      {available} / {res.capacity} Available
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-white mt-3">{res.title}</h3>
                  <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                    {res.description}
                  </p>
                </div>

                <div className="border-t border-slate-800/80 pt-4 space-y-3">
                  <div className="flex justify-between text-xs text-slate-400 font-mono">
                    <span>Est. Cost:</span>
                    <span className="text-slate-200">${res.hourlyCostRate ?? 0} / hr</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 font-mono">
                    <span>Default Lease:</span>
                    <span className="text-slate-200">{res.defaultLeaseMinutes ?? 120} mins</span>
                  </div>

                  <Link
                    href={`/mesh/resources/${res.slug}`}
                    className={`block w-full py-2.5 rounded-lg text-center text-xs font-semibold transition ${
                      isFull
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20"
                    }`}
                  >
                    {isFull ? "Fleet At Capacity" : "Acquire Lease"}
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

