'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib-premium/cn';

interface AtomicReservationProps {
  seatId: string;
  status: 'locked' | 'available' | 'reserved';
  ttlMs?: number;
  onExpire?: () => void;
}

export function AtomicReservationAnimation({
  seatId,
  status,
  ttlMs = 5000,
  onExpire,
}: AtomicReservationProps) {
  const [remaining, setRemaining] = useState(ttlMs);

  useEffect(() => {
    if (status !== 'locked') return;

    const interval = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 100;
        if (next <= 0) {
          onExpire?.();
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [status, ttlMs, onExpire]);

  const percentComplete = ((ttlMs - remaining) / ttlMs) * 100;

  return (
    <div
      className={cn(
        'relative w-12 h-12 rounded-lg flex items-center justify-center font-bold text-sm transition-all duration-200',
        {
          'bg-[var(--signal-active)] text-white scale-105': status === 'locked',
          'bg-[var(--bg-surface-l2)] text-[var(--text-secondary)]': status === 'available',
          'bg-[var(--signal-nominal)] text-white': status === 'reserved',
        }
      )}
    >
      {/* TTL Progress Ring */}
      {status === 'locked' && (
        <>
          <svg
            className="absolute inset-0 w-full h-full"
            style={{
              transform: 'rotate(-90deg)',
            }}
          >
            <circle
              cx="50%"
              cy="50%"
              r="20"
              fill="none"
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth="2"
            />
            <circle
              cx="50%"
              cy="50%"
              r="20"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeDasharray={`${(percentComplete / 100) * 125.6} 125.6`}
              style={{
                transition: 'stroke-dasharray 100ms linear',
              }}
            />
          </svg>

          {/* TTL Text */}
          <div className="text-xs font-mono">
            {Math.ceil(remaining / 1000)}s
          </div>
        </>
      )}

      {/* Seat Number */}
      {status !== 'locked' && <span>{seatId}</span>}
    </div>
  );
}
