import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TableSkeletonProps {
  columns?: number;
  rows?: number;
  /** Optional column labels to show in the header */
  headers?: string[];
}

export function TableSkeleton({ columns = 6, rows = 8, headers }: TableSkeletonProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {(headers || Array.from({ length: columns })).map((h, i) => (
            <TableHead key={i}>
              {typeof h === "string" ? (
                <span className="text-xs">{h}</span>
              ) : (
                <Skeleton className="h-3 w-20" />
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <TableRow key={rowIdx}>
            {Array.from({ length: headers?.length || columns }).map((_, colIdx) => (
              <TableCell key={colIdx}>
                <Skeleton
                  className="h-4"
                  style={{ width: `${50 + Math.random() * 40}%` }}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface ListSkeletonProps {
  rows?: number;
}

/** Card-style skeleton for dashboards / card lists */
export function CardListSkeleton({ rows = 4 }: ListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-lg border bg-card">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Full page loading skeleton with header placeholder */
export function PageSkeleton({ message }: { message?: string }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div data-ui="card" className="bg-card rounded-lg border p-6 space-y-4">
        {message && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
            {message}
          </div>
        )}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24 ml-auto" />
        </div>
        <TableSkeleton />
      </div>
    </div>
  );
}
