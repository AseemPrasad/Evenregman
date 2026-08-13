'use client';

import { MasterLayout } from '@/components-premium/layout/master-layout';
import { ThemeSwitcher } from '@/components-premium/composite/theme-switcher';
import { Toggle } from '@/components-premium/atoms/toggle';
import { useSystemHealth } from '@/hooks-premium/use-system-health';
import { useState } from 'react';

export default function SettingsPage() {
  const health = useSystemHealth();
  const [notifications, setNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);

  return (
    <MasterLayout
      telemetry={
        health.data && {
          cdcSyncStatus: health.data.cdcSyncStatus,
          circuitBreakerState: health.data.circuitBreakerState,
          cacheHitRate: health.data.cacheHitRate,
          outboxLatencyMs: health.data.outboxLatencyMs,
        }
      }
    >
      <div className="space-y-8 max-w-2xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Settings</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Configure your premium experience
          </p>
        </div>

        {/* Theme Settings */}
        <div className="bg-[var(--bg-surface-l1)] border border-[var(--bg-border)] rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Appearance</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 px-4 bg-[var(--bg-surface-l2)] rounded-lg">
              <label className="text-[var(--text-primary)] font-medium">Theme</label>
              <ThemeSwitcher />
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-[var(--bg-surface-l1)] border border-[var(--bg-border)] rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Notifications</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 px-4 bg-[var(--bg-surface-l2)] rounded-lg">
              <label className="text-[var(--text-primary)] font-medium">In-App Notifications</label>
              <Toggle
                enabled={notifications}
                onChange={setNotifications}
              />
            </div>
            <div className="flex items-center justify-between py-3 px-4 bg-[var(--bg-surface-l2)] rounded-lg">
              <label className="text-[var(--text-primary)] font-medium">Email Alerts</label>
              <Toggle
                enabled={emailAlerts}
                onChange={setEmailAlerts}
              />
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-[var(--bg-surface-l1)] border border-[var(--bg-border)] rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">System Info</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 px-4 bg-[var(--bg-surface-l2)] rounded-lg">
              <span className="text-[var(--text-secondary)]">UI Version</span>
              <span className="text-[var(--text-primary)] font-mono">1.0.0</span>
            </div>
            <div className="flex justify-between py-2 px-4 bg-[var(--bg-surface-l2)] rounded-lg">
              <span className="text-[var(--text-secondary)]">API Status</span>
              <span className="text-[var(--signal-nominal)]">Connected</span>
            </div>
          </div>
        </div>
      </div>
    </MasterLayout>
  );
}
