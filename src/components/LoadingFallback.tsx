import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const TIMEOUT_MS = 8000;

export function LoadingFallback() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div data-lg="seite" className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      {showHint && (
        <div className="text-center space-y-3 animate-in fade-in duration-300">
          <p className="text-sm text-muted-foreground">
            Die Verbindung scheint langsam zu sein.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Seite neu laden
          </Button>
        </div>
      )}
    </div>
  );
}
