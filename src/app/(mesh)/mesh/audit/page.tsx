"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  timestamp: string;
  status: string;
}

export default function MeshAuditStreamPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource("/api/mesh/sse/audit");

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setEvents((prev) => [data, ...prev.slice(0, 49)]); // Keep last 50 events
      } catch {
        // ignore non-json messages (heartbeats)
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Security & Governance Live Stream</h1>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center gap-1.5 ${
                connected
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-ping" : "bg-amber-400"}`} />
              {connected ? "LIVE SSE STREAM" : "CONNECTING..."}
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Real-time change stream telemetry capturing every compute checkout, privilege mutation, and lease release.
          </p>
        </div>

        <Link
          href="/mesh"
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 transition self-start"
        >
          &larr; Back to Control Plane
        </Link>
      </div>

      {/* Terminal View */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
        <div className="bg-slate-900/80 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            <span className="ml-2 text-slate-300 font-semibold">resmesh.audit.stream.v1</span>
          </div>
          <div>Streaming via Server-Sent Events (SSE)</div>
        </div>

        <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto divide-y divide-slate-900">
          {events.length === 0 ? (
            <div className="py-12 text-center text-slate-600">
              Awaiting telemetry events from MongoDB Change Stream / Outbox...
            </div>
          ) : (
            events.map((ev, idx) => (
              <div key={ev.id || idx} className="pt-2 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-slate-300">
                <div className="flex items-center space-x-3">
                  <span className="text-slate-500 text-[10px]">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/80 text-[10px] font-bold">
                    {ev.action}
                  </span>
                  <span className="text-slate-200 font-semibold">{ev.entityType}</span>
                  <span className="text-slate-500 text-[11px]">id:{ev.entityId?.slice(0, 8)}...</span>
                </div>
                <div className="flex items-center space-x-4 text-[11px] text-slate-400">
                  <span>actor:{ev.actorId?.slice(0, 8) || "system"}</span>
                  <span className="text-emerald-400 font-bold">{ev.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

