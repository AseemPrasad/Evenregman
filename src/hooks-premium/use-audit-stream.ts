import { useEffect, useState } from 'react';

export interface AuditEntry {
  _id: string;
  action: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

export function useAuditStream() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let eventSource: EventSource;

    const connect = () => {
      try {
        eventSource = new EventSource('/api/sse/audit');
        setConnected(true);
        setError(null);

        eventSource.onmessage = event => {
          try {
            const newEntry = JSON.parse(event.data) as AuditEntry;
            setEntries(prev => [newEntry, ...prev].slice(0, 100));
          } catch (err) {
            console.error('Failed to parse audit entry', err);
          }
        };

        eventSource.onerror = () => {
          setConnected(false);
          setError('Audit stream disconnected');
          eventSource.close();
          setTimeout(connect, 3000);
        };
      } catch (err) {
        setError((err as Error).message);
        setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      eventSource?.close();
    };
  }, []);

  return { entries, error, connected };
}
