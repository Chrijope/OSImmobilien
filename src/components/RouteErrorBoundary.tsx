import React from "react";
import { merkeFehler } from "@/lib/fehlerKontext";
import { oeffneFehlerMeldung } from "@/lib/fehlerMelden";
import { istChunkLadefehler } from "@/lib/chunkLadefehler";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Bug } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Route-level error boundary that wraps the Outlet.
 * Unlike the top-level ErrorBoundary, this one:
 * - Only affects the content area (sidebar + header stay visible)
 * - Allows recovery without full page reload
 * - Auto-recovers on navigation (resets on location change)
 */
export class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("RouteErrorBoundary caught:", error?.message, error?.stack, "Component:", errorInfo?.componentStack);

    // Kein automatisches Neuladen (26.10.2026). Bei einem fehlenden Chunk
    // zeigt die Karte „Jetzt neu laden“, der Nutzer entscheidet.
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error state when children change (i.e. navigation)
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError && istChunkLadefehler(this.state.error)) {
      // Nach einem Deploy fehlt der alte Programmteil. „Erneut versuchen“
      // hilft hier nicht, React merkt sich den Fehlschlag; nur Neuladen.
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md space-y-4">
            <RefreshCw className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">Neue Version verfügbar</h2>
            <p className="text-sm text-muted-foreground">
              Diese Seite gehört zu einer neueren Fassung des CRM. Lade neu, um sie zu öffnen.
              Andere Bereiche kannst du weiter nutzen.
            </p>
            <Button size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Jetzt neu laden
            </Button>
          </div>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">
              Inhalt konnte nicht geladen werden
            </h2>
            <p className="text-sm text-muted-foreground">
              Ein Fehler ist beim Laden dieser Seite aufgetreten.
              Versuche es erneut oder wechsle zu einem anderen Bereich.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-muted p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap break-all">
                {this.state.error.message}
                {"\n"}
                {this.state.error.stack?.split("\n").slice(0, 5).join("\n")}
              </pre>
            )}
            <div className="flex flex-wrap gap-3 justify-center">
              {/* Hier ist der Meldedialog erreichbar, die Anwendung steht ja noch. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const f = merkeFehler({
                    meldung: this.state.error?.message || "Unbekannter Fehler beim Laden",
                    stack: this.state.error?.stack,
                    quelle: "boundary",
                    route: window.location.pathname,
                  });
                  oeffneFehlerMeldung({ fehler: f, screenshot: false, prioritaet: "hoch" });
                }}
              >
                <Bug className="h-4 w-4 mr-2" />
                Fehler melden
              </Button>
              <Button variant="outline" size="sm" onClick={this.handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Erneut versuchen
              </Button>
              <Button size="sm" onClick={() => {
                const url = new URL(window.location.origin + "/");
                url.searchParams.set("__retry", String(Date.now()));
                window.location.assign(url.toString());
              }}>
                Zum Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
