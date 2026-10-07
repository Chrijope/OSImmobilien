import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { BugReportDialog } from "@/components/BugReportDialog";
import {
  holeGespeichertenFehler,
  installiereFehlerAufzeichnung,
  merkeNutzerschritt,
} from "@/lib/fehlerKontext";
import { darfFehlerHinweisZeigen, oeffneFehlerMeldung } from "@/lib/fehlerMelden";

/**
 * Hängt die Fehleraufzeichnung ein und hält den Meldedialog global bereit.
 *
 * Der Dialog lag bisher in der Kopfzeile. Damit war er genau dann nicht
 * erreichbar, wenn ein Absturz die ganze Anwendung durch die Fehlerseite
 * ersetzt. Hier liegt er über den Routen und ist immer da.
 *
 * Bei einem Absturz springt der Meldedialog seit dem 16.09.2026 nicht mehr von
 * allein auf. An dem Tag meldete ein Vertriebspartner, er bekomme "die ganze
 * Zeit Fehlercodes, egal wo ich rumklicke". Der Verstärker hier war das
 * automatische Aufspringen samt Bildschirmfoto: Bei einem einzelnen Fehler
 * hilfreich, bei einer Fehlerwelle selbst die Störung, weil der Dialog die
 * Arbeit blockiert. Stattdessen gibt es jetzt einen roten Hinweis mit dem Knopf
 * "Der IT melden", der denselben Dialog öffnet. Je Fehlerart erscheint er nur
 * einmal pro Sitzung, siehe `darfFehlerHinweisZeigen`.
 */
export function FehlerAufzeichnung() {
  const location = useLocation();

  useEffect(() => {
    installiereFehlerAufzeichnung((fehler) => {
      if (!darfFehlerHinweisZeigen(fehler.ruhefingerabdruck)) return;
      /*
       * Bewusst `oeffneFehlerMeldung` statt `meldeFehlerAusToast`: Letzteres
       * legt den Fehler als Quelle "manuell" neu an und verlöre dabei Stack
       * und Quelle des echten Absturzes. Der Dialog ist derselbe.
       */
      toast.error("Da ist etwas schiefgelaufen.", {
        description:
          "Bitte lade die Seite neu, wenn etwas fehlt. Wenn es sich wiederholt, melde es bitte der IT.",
        duration: 12000,
        action: {
          label: "Der IT melden",
          onClick: () => oeffneFehlerMeldung({ fehler, screenshot: true, prioritaet: "hoch" }),
        },
      });
    });
  }, []);

  useEffect(() => {
    merkeNutzerschritt(`Seite: ${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  // Rückkehr von der Fehlerseite: Dialog mit dem gemerkten Fehler öffnen und
  // den Parameter wieder aus der Adresse nehmen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("fehlerMelden") !== "1") return;
    const fehler = holeGespeichertenFehler();
    params.delete("fehlerMelden");
    params.delete("__retry");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
    oeffneFehlerMeldung({ fehler, screenshot: false, prioritaet: "hoch" });
  }, []);

  return <BugReportDialog />;
}
