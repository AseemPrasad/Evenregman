import Link from "next/link";
import { getActiveEntitlements } from "@/lib/billing/entitlements";
import { getTenantMonthlyUsage } from "@/lib/billing/metering";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const entitlements = await getActiveEntitlements();
  const usage = await getTenantMonthlyUsage();

  const isEnterprise = entitlements.tier === "ENTERPRISE";

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Subscription, Usage & Entitlements</h1>
        <p className="text-slate-400 text-sm mt-1">
          Monitor your compute allocation tiers, enterprise feature flags, and monthly resource consumption.
        </p>
      </div>

      {/* Plan Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/80 font-bold">
                ACTIVE PLAN
              </span>
              <h2 className="text-xl font-bold text-white mt-2">
                {entitlements.tier === "ENTERPRISE"
                  ? "Enterprise License"
                  : entitlements.tier === "TEAM"
                  ? "Team Plan"
                  : "Community Edition (Self-Hosted Open Source)"}
              </h2>
            </div>
            {!isEnterprise && (
              <button
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-cyan-500/20"
              >
                Upgrade to Enterprise &rarr;
              </button>
            )}
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {isEnterprise
              ? "Your enterprise license includes full SCIM v2 user syncing, SAML/Okta SSO, live SSE audit streaming, unlimited compute fleets, and 99.99% SLA."
              : "You are running the free, open-source Community Edition. Includes atomic Redis Lua locks, self-healing expiring leases, and local fleet management."}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-xs font-mono">
            <div>
              <span className="text-slate-500">Fleet Limit:</span>
              <p className="text-slate-200 font-bold mt-0.5">
                {entitlements.maxResources > 1000 ? "Unlimited" : entitlements.maxResources}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Max Leases/User:</span>
              <p className="text-slate-200 font-bold mt-0.5">{entitlements.maxConcurrentLeasesPerUser}</p>
            </div>
            <div>
              <span className="text-slate-500">License Status:</span>
              <p className="text-emerald-400 font-bold mt-0.5">
                {isEnterprise ? "VERIFIED" : "COMMUNITY CORE"}
              </p>
            </div>
          </div>
        </div>

        {/* Feature Entitlements Checklist */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold font-mono uppercase text-slate-400 tracking-wider">Feature Gates</h3>
          <ul className="space-y-2.5 text-xs">
            <li className="flex items-center justify-between">
              <span className="text-slate-300">Redis Lua Locking</span>
              <span className="text-emerald-400 font-bold">Enabled</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-300">Expiring Leases (TTL)</span>
              <span className="text-emerald-400 font-bold">Enabled</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-300">SCIM v2 & Okta SSO</span>
              <span className={isEnterprise ? "text-emerald-400 font-bold" : "text-slate-500 font-mono"}>
                {isEnterprise ? "Enabled" : "Enterprise"}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-300">Live SSE Audit Stream</span>
              <span className="text-emerald-400 font-bold">Enabled</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-300">Redis Streams Event Bus</span>
              <span className="text-emerald-400 font-bold">Enabled</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Monthly Consumption Metering */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-5">
        <h3 className="text-base font-semibold text-white">Current Month Usage Metering</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 font-mono">
            <span className="text-xs text-slate-500 uppercase">Total Leased Compute</span>
            <div className="text-2xl font-bold text-white mt-1">{usage.totalLeaseMinutes}m</div>
            <span className="text-[11px] text-slate-500 mt-1 block">{(usage.totalLeaseMinutes / 60).toFixed(1)} GPU/Node hours</span>
          </div>

          <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 font-mono">
            <span className="text-xs text-slate-500 uppercase">Estimated Compute Spend</span>
            <div className="text-2xl font-bold text-cyan-400 mt-1">${usage.totalComputeDollars.toFixed(2)}</div>
            <span className="text-[11px] text-slate-500 mt-1 block">Tracked active cloud burn</span>
          </div>

          <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 font-mono">
            <span className="text-xs text-slate-500 uppercase">Mesh API Requests</span>
            <div className="text-2xl font-bold text-indigo-400 mt-1">{usage.totalApiCalls}</div>
            <span className="text-[11px] text-slate-500 mt-1 block">Lease checkouts & extensions</span>
          </div>
        </div>
      </div>
    </div>
  );
}

