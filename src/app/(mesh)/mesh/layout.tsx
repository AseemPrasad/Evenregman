import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

export const metadata: Metadata = {
  title: "ResMesh | Enterprise AI & Scarce Resource Allocation Mesh",
  description: "Deterministic, high-concurrency reservation mesh for AI compute, GPU clusters, and preview environments."
};

export default function MeshLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link href="/mesh" className="flex items-center space-x-2 font-mono font-bold text-lg tracking-tight">
              <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
              <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
                ResMesh
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 uppercase font-semibold">
                Control Plane
              </span>
            </Link>

            <nav className="hidden md:flex items-center space-x-1 text-sm font-medium text-slate-300">
              <Link href="/mesh" className="px-3 py-1.5 rounded-md hover:text-white hover:bg-slate-800 transition">
                Overview
              </Link>
              <Link href="/mesh/resources" className="px-3 py-1.5 rounded-md hover:text-white hover:bg-slate-800 transition">
                Compute Fleets
              </Link>
              <Link href="/mesh/leases" className="px-3 py-1.5 rounded-md hover:text-white hover:bg-slate-800 transition">
                Active Leases
              </Link>
              <Link href="/mesh/audit" className="px-3 py-1.5 rounded-md hover:text-white hover:bg-slate-800 transition">
                Live Audit Stream
              </Link>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1.5 rounded-md border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>L1 Redis + L2 Mongo ACID</span>
            </div>
            <Link
              href="/dashboard"
              className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Classic Portal &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        ResMesh Distributed Control Plane &bull; Powered by Atomic Redis Leases, Outbox Relays & OpenTelemetry
      </footer>
    </div>
  );
}

