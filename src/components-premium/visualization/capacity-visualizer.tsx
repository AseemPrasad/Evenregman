'use client';

import { CapacityMetrics } from '@/hooks-premium/use-capacity';
import { cn } from '@/lib-premium/cn';

interface CapacityVisualizerProps {
  metrics: CapacityMetrics;
  showLegend?: boolean;
}

export function CapacityVisualizer({ metrics, showLegend = true }: CapacityVisualizerProps) {
  const items = [
    { label: 'Confirmed', value: metrics.confirmed, color: 'var(--signal-nominal)', percentage: (metrics.confirmed / metrics.totalCapacity) * 100 },
    { label: 'Waitlisted', value: metrics.waitlisted, color: 'var(--signal-active)', percentage: (metrics.waitlisted / metrics.totalCapacity) * 100 },
    { label: 'Available', value: metrics.available, color: 'var(--bg-surface-l2)', percentage: (metrics.available / metrics.totalCapacity) * 100 },
  ];

  return (
    <div className="space-y-4">
      {/* Main Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-muted)] uppercase">Utilization</div>
          <div className="text-3xl font-bold text-[var(--text-primary)]">
            {metrics.utilizationPercent.toFixed(1)}%
          </div>
        </div>
        <div className="bg-[var(--bg-surface-l2)] border border-[var(--bg-border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-muted)] uppercase">Available Seats</div>
          <div className="text-3xl font-bold text-[var(--signal-nominal)]">
            {metrics.available}
          </div>
        </div>
      </div>

      {/* Stacked Bar */}
      <div className="space-y-2">
        <div className="flex h-8 rounded-lg overflow-hidden border border-[var(--bg-border)]">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                'transition-all',
                item.value > 0 ? 'flex-grow' : 'flex-shrink'
              )}
              style={{
                backgroundColor: item.color,
                width: `${item.percentage}%`,
                opacity: item.value > 0 ? 1 : 0.2,
              }}
            />
          ))}
        </div>

        {/* Capacity Info */}
        <div className="text-xs text-[var(--text-muted)] text-center">
          {metrics.confirmed + metrics.waitlisted} / {metrics.totalCapacity} seats booked
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center space-x-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[var(--text-secondary)] flex-1">{item.label}</span>
              <span className="text-[var(--text-primary)] font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warning */}
      {metrics.utilizationPercent > 90 && (
        <div className="p-3 bg-[var(--signal-critical)]/10 border border-[var(--signal-critical)]/30 rounded-lg text-xs text-[var(--signal-critical)]">
          ⚠️ Event near capacity - only {metrics.available} seats remaining
        </div>
      )}
    </div>
  );
}
