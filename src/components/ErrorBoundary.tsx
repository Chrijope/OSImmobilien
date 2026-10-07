import React from "react";
import { merkeFehler, speichereFuerNeuladen } from "@/lib/fehlerKontext";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorId?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Kurze, lesbare Error-ID für Support-Anfragen
    const errorId = `ERR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary ${this.state.errorId}] caught:`, error, errorInfo);
    // Auto-reload on dynamic import failures (stale chunks after deploy)
    if (
      error.message?.includes("dynamically imported module") ||
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("error loading dynamically imported module") ||
      error.message?.includes("Importing a module script failed") ||
      error.message?.includes("Loading module") ||
      error.message?.includes("Loading chunk")
    ) {
      const reloadKey = "eb_reload_" + window.location.pathname;
      const lastReload = sessionStorage.getItem(reloadKey);
      if (!lastReload || Date.now() - Number(lastReload) > 10000) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        const url = new URL(window.location.href);
        url.searchParams.set("__reload", String(Date.now()));
        window.location.replace(url.toString());
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div data-lg="seite" className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="text-center max-w-md space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">
              Ein unerwarteter Fehler ist aufgetreten
            </h1>
            <p className="text-muted-foreground text-sm">
              {this.state.error?.message || "Bitte lade die Seite neu."}
            </p>
            {this.state.errorId && (
              <p className="text-xs text-muted-foreground font-mono">
                Fehler-ID: {this.state.errorId}
                <br />
                <span className="text-[10px]">
                  Bitte teile diese ID dem Support mit.
                </span>
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("__retry", String(Date.now()));
                window.location.replace(url.toString());
              }}>
                Seite neu laden
              </Button>
              {/*
                Der Meldedialog lebt innerhalb der Anwendung, die hier gerade
                ersetzt wurde. Deshalb der Umweg: Fehler in die Sitzung legen,
                neu laden, und der Dialog geht danach von selbst auf.
              */}
              <Button
                variant="outline"
                onClick={() => {
                  const f = merkeFehler({
                    meldung: this.state.error?.message || "Unbekannter Absturz",
                    stack: this.state.error?.stack,
                    quelle: "boundary",
                    route: window.location.pathname,
                  });
                  speichereFuerNeuladen(f);
                  const url = new URL(window.location.href);
                  url.searchParams.set("fehlerMelden", "1");
                  window.location.replace(url.toString());
                }}
              >
                Fehler melden
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
