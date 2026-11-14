"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export function LeaseControls({
  leaseId,
  initialMinutesLeft
}: {
  leaseId: string;
  initialMinutesLeft: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleAction(action: "release" | "extend") {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/mesh/leases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId,
          action,
          additionalMinutes: action === "extend" ? 60 : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      setMessage(data.message);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error executing action");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message && <span className="text-[11px] text-slate-400 mr-2">{message}</span>}
      <button
        onClick={() => handleAction("extend")}
        disabled={loading}
        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition disabled:opacity-50"
      >
        +60m Extend
      </button>
      <button
        onClick={() => handleAction("release")}
        disabled={loading}
        className="px-3 py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition disabled:opacity-50"
      >
        Release Early
      </button>
    </div>
  );
}

