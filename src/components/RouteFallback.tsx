import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const STUCK_HINT_MS = 10_000;

/**
 * Inline route transition fallback.
 * Shows within the content area (sidebar + header stay visible)
 * instead of a full-screen spinner.
 *
 * If the route stays in suspense for too long (e.g. a lazy chunk failed to load
 * silently), shows a recovery hint with a hard-reload button so the user is
 * never stuck staring at empty skeletons forever.
 */
export function RouteFallback() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), STUCK_HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleReload = () => {
    try {
      // Best-effort cache bust + clean reload
      const url = new URL(window.location.href);
      url.searchParams.set("__reload", String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      {/* Content skeleton */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />

      {stuck && (
        <div className="flex flex-col items-center gap-3 py-6 text-center animate-in fade-in duration-300">
          <p className="text-sm text-muted-foreground">
            Die Seite lädt ungewöhnlich lange. Möglicherweise ist eine neue Version
            verfügbar.
          </p>
          <Button variant="outline" size="sm" onClick={handleReload}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Seite neu laden
          </Button>
        </div>
      )}
    </div>
  );
}
