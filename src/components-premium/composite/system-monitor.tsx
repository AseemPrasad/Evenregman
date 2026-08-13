'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib-premium/cn';

interface SystemAlert {
  id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  timestamp: Date;
}

interface SystemMonitorProps {
  alerts: SystemAlert[];
  onDismiss?: (id: string) => void;
}

const levelConfig = {
  info: { bg: 'bg-[var(--signal-action)]/10', text: 'text-[var(--signal-action)]', icon: 'ℹ️' },
  warning: { bg: 'bg-[var(--signal-warning)]/10', text: 'text-[var(--signal-warning)]', icon: '⚠️' },
  error: { bg: 'bg-[var(--signal-critical)]/10', text: 'text-[var(--signal-critical)]', icon: '✕' },
};

export function SystemMonitor({ alerts, onDismiss }: SystemMonitorProps) {
  const [visible, setVisible] = useState(true);

  if (!visible || alerts.length === 0) {
    return null;
  }

  const latestAlert = alerts[alerts.length - 1];
  const config = levelConfig[latestAlert.level];

  return (
    <div
      className={cn(
        'fixed top-4 right-4 max-w-sm p-4 rounded-lg border',
        config.bg,
        'z-50 animate-slide-in-right'
      )}
    >
      <div className="flex items-start space-x-3">
        <span className="text-xl">{config.icon}</span>
        <div className="flex-1">
          <p className={cn('text-sm font-medium', config.text)}>
            {latestAlert.message}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {latestAlert.timestamp.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={() => {
            onDismiss?.(latestAlert.id);
            if (alerts.length === 1) setVisible(false);
          }}
          className={cn('p-1 hover:opacity-50 transition-opacity', config.text)}
        >
          ✕
        </button>
      </div>

      {/* Alert counter */}
      {alerts.length > 1 && (
        <div className="mt-3 text-xs text-[var(--text-muted)]">
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

export function useSystemAlerts() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);

  const addAlert = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
    const alert: SystemAlert = {
      id: Math.random().toString(36).substr(2, 9),
      level,
      message,
      timestamp: new Date(),
    };

    setAlerts(prev => [...prev, alert]);

    if (level !== 'error') {
      setTimeout(() => dismissAlert(alert.id), 5000);
    }
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return { alerts, addAlert, dismissAlert };
}
