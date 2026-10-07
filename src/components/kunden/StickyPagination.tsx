import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, List } from "lucide-react";

const DEFAULT_PAGE_SIZE_OPTIONS = [50, 60, 70, 80, 90, 100];

export function usePagination(
  storageKey: string,
  total: number,
  options?: { pageSizeOptions?: number[]; defaultPageSize?: number }
) {
  const sizeOptions = options?.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;
  const defaultSize = options?.defaultPageSize ?? sizeOptions[0] ?? 50;
  const [pageSize, setPageSizeState] = useState<number>(() => {
    if (typeof window === "undefined") return defaultSize;
    const stored = window.localStorage.getItem(`pagination:${storageKey}:pageSize`);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return sizeOptions.includes(parsed) ? parsed : defaultSize;
  });
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);

  const setPageSize = (n: number) => {
    setPageSizeState(n);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`pagination:${storageKey}:pageSize`, String(n));
    }
    setPage(1);
  };

  const effectiveSize = showAll ? Math.max(total, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectiveSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const start = (page - 1) * effectiveSize;
  const end = start + effectiveSize;

  const slice = <T,>(items: T[]): T[] => items.slice(start, end);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    showAll,
    setShowAll,
    totalPages,
    start,
    end,
    slice,
    pageSizeOptions: sizeOptions,
  };
}

interface StickyPaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  showAll: boolean;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  onToggleShowAll: (show: boolean) => void;
  pageSizeOptions?: number[];
  sticky?: boolean;
}

export function StickyPagination({
  page, totalPages, pageSize, showAll, total,
  onPageChange, onPageSizeChange, onToggleShowAll,
  pageSizeOptions,
  sticky = true,
}: StickyPaginationProps) {
  if (total === 0) return null;
  const sizeOptions = pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;

  const goPrev = () => onPageChange(Math.max(1, page - 1));
  const goNext = () => onPageChange(Math.min(totalPages, page + 1));

  // Compact page numbers (max 7 visible)
  const pageNumbers: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (page > 3) pageNumbers.push("…");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (page < totalPages - 2) pageNumbers.push("…");
    pageNumbers.push(totalPages);
  }

  return (
    <>
    {sticky && <div aria-hidden className="h-20" />}
    <div className={sticky
      ? "fixed bottom-4 left-4 right-4 md:left-[calc(var(--sidebar-width,16rem)+1rem)] md:right-6 z-30 mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-full border border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-2 shadow-[0_8px_32px_-8px_hsl(var(--foreground)/0.25)]"
      : "mt-4 border-t border-border pt-3"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {showAll
              ? <>Alle <strong className="text-foreground">{total}</strong> Einträge</>
              : <>
                  Seite <strong className="text-foreground">{page}</strong> von <strong className="text-foreground">{totalPages}</strong>
                  <span className="ml-2 text-muted-foreground/70">({total} {total === 1 ? "Eintrag" : "Einträge"})</span>
                </>}
          </span>
          <div className="flex items-center gap-1.5">
            <span>Pro Seite:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { onToggleShowAll(false); onPageSizeChange(parseInt(v, 10)); }}
              disabled={showAll}
            >
              <SelectTrigger className="h-7 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sizeOptions.map(n => (
                  <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={showAll ? "default" : "outline"}
            className="h-7 gap-1 text-xs"
            onClick={() => onToggleShowAll(!showAll)}
          >
            <List className="h-3 w-3" /> Alle ansehen
          </Button>
          {!showAll && (
            <>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={goPrev} disabled={page === 1}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {pageNumbers.map((n, idx) =>
                n === "…" ? (
                  <span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={n}
                    size="sm"
                    variant={n === page ? "default" : "outline"}
                    className="h-7 min-w-7 px-2 text-xs"
                    onClick={() => onPageChange(n)}
                  >
                    {n}
                  </Button>
                )
              )}
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={goNext} disabled={page === totalPages}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
