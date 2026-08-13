'use client';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
} from '@tanstack/react-table';
import { Registration } from '@/hooks-premium/use-registrations';
import { cn } from '@/lib-premium/cn';
import { Badge } from '../atoms/badge';
import { Button } from '../atoms/button';

const columns: ColumnDef<Registration>[] = [
  {
    accessorKey: 'guestName',
    header: 'Guest Name',
  },
  {
    accessorKey: 'guestEmail',
    header: 'Email',
  },
  {
    accessorKey: 'seatsRequested',
    header: 'Seats',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const statusVariants: Record<string, 'nominal' | 'active' | 'warning' | 'critical'> = {
        confirmed: 'nominal',
        waitlisted: 'active',
        cancelled: 'critical',
      };
      return <Badge variant={statusVariants[row.original.status]}>{row.original.status}</Badge>;
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
];

interface RegistrationTableProps {
  data: Registration[];
  isLoading?: boolean;
}

export function RegistrationTable({ data, isLoading }: RegistrationTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (isLoading) {
    return <div className="text-[var(--text-muted)]">Loading registrations...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-[var(--bg-border)]">
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-b border-[var(--bg-border)] hover:bg-[var(--bg-surface-l2)] transition-colors">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-4 py-3 text-[var(--text-primary)]">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--text-muted)]">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
