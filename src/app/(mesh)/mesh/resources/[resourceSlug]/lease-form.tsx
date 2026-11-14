"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export function LeaseBookingForm({
  resourceSlug,
  defaultDuration,
  maxDuration
}: {
  resourceSlug: string;
  defaultDuration: number;
  maxDuration: number;
}) {
  const router = useRouter();
  const [duration, setDuration] = useState(defaultDuration);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [leaseToken, setLeaseToken] = useState<string | null>(null);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/mesh/leases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceSlug, durationMinutes: duration })
      });

      const data = await res.json();

      if (res.status === 401) {
        const currentUrl = encodeURIComponent(window.location.pathname);
        router.push(`/signin?callbackUrl=${currentUrl}`);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to acquire lease.");
      }

      setSuccess(data.message);
      setLeaseToken(data.leaseToken);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
      <h3 className="text-base font-semibold text-white">Acquire Immediate Lease</h3>
      <p className="text-xs text-slate-400 mt-1">
        Deterministic reservation with automated TTL lease expiration and zero overbooking.
      </p>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 space-y-2">
          <div>{success}</div>
          {leaseToken && (
            <div className="font-mono text-[11px] bg-slate-950 p-2 rounded border border-slate-800 break-all select-all">
              Token: {leaseToken}
            </div>
          )}
        </div>
      )}

      {!success && (
        <form onSubmit={handleBook} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-300">
              Lease Duration: <span className="text-cyan-400 font-bold">{duration} mins</span> ({(duration / 60).toFixed(1)} hrs)
            </label>
            <input
              type="range"
              min={30}
              max={maxDuration}
              step={30}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full mt-2 accent-cyan-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>30m</span>
              <span>Max {maxDuration}m</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition disabled:opacity-50"
          >
            {loading ? "Allocating via Redis L1..." : "Confirm & Lock Lease"}
          </button>
        </form>
      )}
    </div>
  );
}

