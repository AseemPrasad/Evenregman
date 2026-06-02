"use client";

import React, { useEffect, useState } from "react";
import Skeleton from "@/components/ui/skeleton";
import EmptyState from "@/components/ui/empty-state";

type Attendee = { id: string; name: string; email: string };

type Row = { id: string; status: string; registeredAt: string; attendee: Attendee };

type Initial = {
  total: number;
  page: number;
  limit: number;
  data: Row[];
};

export default function RegistrationTable({
  eventId,
  initialData
}: {
  eventId: string;
  initialData: Initial;
}) {
  const [data, setData] = useState<Row[]>(initialData.data || []);
  const [page, setPage] = useState<number>(initialData.page || 1);
  const [limit, setLimit] = useState<number>(initialData.limit || 20);
  const [total, setTotal] = useState<number>(initialData.total || 0);
  const [search, setSearch] = useState<string>("");
  const [sort, setSort] = useState<string>("newest");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // keep initial data on mount
    setData(initialData.data || []);
    setTotal(initialData.total || 0);
    setPage(initialData.page || 1);
  }, [initialData]);

  async function fetchPage(p = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(limit));
      if (search) params.set("search", search);
      if (sort) params.set("sort", sort);

      const res = await fetch(`/api/host/events/${eventId}/registrations?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin"
      });

      if (!res.ok) {
        setData([]);
        setTotal(0);
        return;
      }

      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
      setPage(json.page || 1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // fetch when page/limit/search/sort changes
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, search, sort]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <input
          aria-label="Search attendees"
          placeholder="Search by name or email"
          className="flex-1 rounded border px-3 py-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded border px-2 py-2">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="alpha">Name (A-Z)</option>
        </select>
        <button type="submit" className="rounded bg-primary px-4 py-2 text-white" disabled={loading}>
          Search
        </button>
      </form>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm"
          onClick={() => {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            if (sort) params.set("sort", sort);
            params.set("mode", "name_email");
            window.location.href = `/api/host/events/${eventId}/registrations/export?${params.toString()}`;
          }}
        >
          Export (Name + Email)
        </button>

        <button
          type="button"
          className="rounded border px-3 py-1 text-sm"
          onClick={() => {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            if (sort) params.set("sort", sort);
            params.set("mode", "email");
            window.location.href = `/api/host/events/${eventId}/registrations/export?${params.toString()}`;
          }}
        >
          Export (Email only)
        </button>
      </div>

      <div className="overflow-x-auto rounded">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: limit > 10 ? 10 : limit }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-t">
                  <td className="px-4 py-3"><Skeleton width="140px" height={16} /></td>
                  <td className="px-4 py-3"><Skeleton width="220px" height={16} /></td>
                  <td className="px-4 py-3"><Skeleton width="120px" height={16} /></td>
                </tr>
              ))
            )}

            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8">
                  <EmptyState title="No registrations" description="No attendees have registered for this event yet." />
                </td>
              </tr>
            )}

            {!loading && data.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-3">{row.attendee.name}</td>
                <td className="px-4 py-3">{row.attendee.email}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(row.registeredAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Rows</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded border px-2 py-1">
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button className="rounded border px-3 py-1" disabled={page <= 1 || loading} onClick={() => fetchPage(page - 1)}>
            Prev
          </button>
          <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
          <button className="rounded border px-3 py-1" disabled={page >= totalPages || loading} onClick={() => fetchPage(page + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
