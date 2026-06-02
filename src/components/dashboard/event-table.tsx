"use client";

import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { closeEventAction, deleteEventAction, reopenEventAction } from "@/app/(host)/host/dashboard/actions";
import type { HostEventRow } from "@/lib/dashboard";

type Props = {
  data: HostEventRow[];
};

function StatusPill({ status }: { status: HostEventRow["status"] }) {
  const tone =
    status === "OPEN"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "CLOSED"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : status === "FULL"
          ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{status}</span>;
}

function formatEventDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

function ActionsCell({ event }: { event: HostEventRow }) {
  const [isPending, startTransition] = useTransition();

  async function runAction(action: (eventId: string) => Promise<{ success: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action(event.id);

      if (result.success) {
        toast.success(result.message);
        window.location.reload();
        return;
      }

      toast.error(result.message);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/host/events/${event.id}/registrations`}>View registrations</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/host/events/${event.id}/edit`}>Edit</Link>
      </Button>
      {event.status !== "CLOSED" ? (
        <Button size="sm" variant="secondary" disabled={isPending} onClick={() => runAction(closeEventAction)}>
          Close
        </Button>
      ) : (
        <Button size="sm" variant="secondary" disabled={isPending} onClick={() => runAction(reopenEventAction)}>
          Reopen
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => runAction(deleteEventAction)}>
        Delete
      </Button>
    </div>
  );
}

export function EventTable({ data }: Props) {
  const columns: ColumnDef<HostEventRow>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.title}</div>
          <div className="text-sm text-muted-foreground">/{row.original.slug}</div>
        </div>
      )
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => formatEventDate(new Date(row.original.date))
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusPill status={row.original.status} />
    },
    {
      accessorKey: "registrationCount",
      header: "Registrations",
      cell: ({ row }) => (
        <div className="text-sm text-foreground">
          {row.original.registrationCount} / {row.original.capacity}
        </div>
      )
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => <ActionsCell event={row.original} />
    }
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <Card className="border-border/70 bg-card/90">
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-border/70 bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 font-medium text-muted-foreground">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-4 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={columns.length}>
                  No events yet. Create your first event to start collecting registrations.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
