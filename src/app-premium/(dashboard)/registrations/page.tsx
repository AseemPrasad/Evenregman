'use client';

import { useState } from 'react';
import { MasterLayout } from '@/components-premium/layout/master-layout';
import { RegistrationTable } from '@/components-premium/tables/registration-table';
import { DetailDock } from '@/components-premium/composite/detail-dock';
import { Select } from '@/components-premium/atoms/select';
import { useRegistrations } from '@/hooks-premium/use-registrations';
import { useEventList } from '@/hooks-premium/use-event';
import { useSystemHealth } from '@/hooks-premium/use-system-health';

export default function RegistrationsPage() {
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [showDetail, setShowDetail] = useState(false);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);

  const events = useEventList();
  const registrations = useRegistrations(selectedEventId || undefined);
  const health = useSystemHealth();

  const selectedReg = selectedRegistrationId
    ? registrations.data?.registrations?.find(r => r._id === selectedRegistrationId)
    : null;

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
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Registrations</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Manage event registrations and track confirmations
          </p>
        </div>

        {/* Filter */}
        <div className="w-full max-w-xs">
          <Select
            label="Filter by Event"
            options={[
              { value: '', label: 'All Events' },
              ...(events.data?.map(e => ({ value: e._id, label: e.name })) || []),
            ]}
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-surface-l1)] border border-[var(--bg-border)] rounded-lg p-4">
          <RegistrationTable
            data={registrations.data?.registrations || []}
            isLoading={registrations.isLoading}
          />
        </div>
      </div>

      {/* Detail Dock */}
      {selectedReg && (
        <DetailDock
          title="Registration Details"
          isOpen={showDetail}
          onClose={() => setShowDetail(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase">Guest Name</label>
              <p className="text-[var(--text-primary)] font-medium">{selectedReg.guestName}</p>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase">Email</label>
              <p className="text-[var(--text-primary)]">{selectedReg.guestEmail}</p>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase">Seats</label>
              <p className="text-[var(--text-primary)] font-medium">{selectedReg.seatsRequested}</p>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase">Status</label>
              <p className="text-[var(--text-primary)] capitalize">{selectedReg.status}</p>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase">Created</label>
              <p className="text-[var(--text-primary)]">
                {new Date(selectedReg.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        </DetailDock>
      )}
    </MasterLayout>
  );
}
