'use client';

import { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { TelemetryPanel, type TelemetryPanelProps } from './telemetry-panel';

interface MasterLayoutProps {
  children: ReactNode;
  telemetry?: TelemetryPanelProps;
}

export function MasterLayout({ children, telemetry }: MasterLayoutProps) {
  return (
    <div className="flex h-screen bg-[var(--bg-base)]">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          {children}
        </div>
      </main>

      {/* Right Telemetry Panel */}
      <div className="w-72 hidden lg:block border-l border-[var(--bg-border)]">
        <TelemetryPanel {...(telemetry || {})} />
      </div>
    </div>
  );
}
