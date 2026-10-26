import { Component, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import i18n from "@/i18n";

interface Props { children: ReactNode }
interface State { hasError: boolean }

/**
 * Freundlicher Error Boundary speziell fürs Kundenportal.
 *
 * Unterschied zur internen RouteErrorBoundary: Kunden sehen keinen Stacktrace
 * und keinen Fehler-melden-Dialog, sondern eine ruhige Meldung in Du-Form.
 * Bei veralteten Chunks nach einem Deploy wird nicht mehr selbst neu geladen
 * (26.10.2026), der Knopf „Seite neu laden“ unten genügt.
 */
export class KundeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[KundeErrorBoundary]", error, info);
  }

  componentDidUpdate(prevProps: Props) {
    // Beim Seitenwechsel automatisch erholen.
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">
              {i18n.t("portal.error.title", { defaultValue: "Hier ist etwas schiefgelaufen" })}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {i18n.t("portal.error.text", {
                defaultValue:
                  "Wir konnten diesen Bereich gerade nicht laden. Bitte lade die Seite neu. " +
                  "Falls das Problem bestehen bleibt, wende dich gerne an deinen Berater.",
              })}
            </p>
          </div>
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {i18n.t("portal.error.reload", { defaultValue: "Seite neu laden" })}
          </Button>
        </Card>
      </div>
    );
  }
}
